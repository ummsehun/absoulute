mod platform;
mod protocol;
mod scan;

use std::io::{BufRead, BufReader, BufWriter, Write};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Instant;

use anyhow::{Context, Result};
use crossbeam_channel::unbounded;

use protocol::{IncomingMessage, OutgoingMessage, ScanMode};
use scan::aggregate::{emit_done, emit_message, ControlState, ScanRuntime};

fn main() -> Result<()> {
    let controls = Arc::new(ControlState::new());
    let (control_tx, control_rx) = unbounded::<IncomingMessage>();

    thread::spawn(move || {
        let stdin = std::io::stdin();
        let lines = BufReader::new(stdin.lock()).lines();
        for line in lines.map_while(Result::ok) {
            if let Ok(message) = serde_json::from_str::<IncomingMessage>(&line) {
                let _ = control_tx.send(message);
            }
        }
    });

    let request = loop {
        let incoming = control_rx
            .recv()
            .context("missing start message from stdin channel")?;
        if let Some(start) = incoming.into_start() {
            break start;
        }
    };
    let _ = rayon::ThreadPoolBuilder::new()
        .num_threads(request.concurrency.max(1))
        .build_global();

    let stdout = std::io::stdout();
    let mut writer = BufWriter::new(stdout.lock());
    let started_at = Instant::now();

    let mut runtime = ScanRuntime {
        request: &request,
        controls: &controls,
        writer: &mut writer,
        started_at,
        scanned_count: 0,
        permission_errors: 0,
        io_errors: 0,
    };

    let summary = run_scan_loop(&mut runtime, &control_rx)?;

    emit_done(&mut runtime.writer, summary.elapsed_ms, summary.estimated)?;
    runtime.writer.flush()?;
    Ok(())
}

fn run_scan_loop<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    control_rx: &crossbeam_channel::Receiver<IncomingMessage>,
) -> Result<scan::aggregate::ScanSummary> {
    loop {
        while let Ok(msg) = control_rx.try_recv() {
            match msg {
                IncomingMessage::Pause => runtime.controls.paused.store(true, Ordering::Relaxed),
                IncomingMessage::Resume => runtime.controls.paused.store(false, Ordering::Relaxed),
                IncomingMessage::Cancel => runtime.controls.cancelled.store(true, Ordering::Relaxed),
                IncomingMessage::Start { .. } => {}
            }
        }

        if runtime.controls.cancelled.load(Ordering::Relaxed) {
            emit_message(
                runtime.writer,
                &OutgoingMessage::Warn {
                    code: "E_CANCELLED".to_string(),
                    message: "Scan cancelled".to_string(),
                    path: Some(runtime.request.root.clone()),
                    recoverable: true,
                },
            )?;
            return Ok(scan::aggregate::ScanSummary {
                elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
                estimated: true,
            });
        }

        return match runtime.request.mode {
            ScanMode::Quick => scan::quick::run(runtime),
            ScanMode::Deep => scan::deep::run(runtime),
        };
    }
}
