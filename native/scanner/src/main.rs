mod platform;
mod protocol;
mod scan;

use std::io::{BufRead, BufReader, BufWriter, Write};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Instant;

use anyhow::Result;
use crossbeam_channel::unbounded;

use protocol::{IncomingMessage, OutgoingMessage, ScanMode, StartRequest};
use scan::aggregate::{emit_done, emit_message, ControlState, ScanRuntime};

fn main() -> Result<()> {
    let controls = Arc::new(ControlState::new());
    let controls_for_stdin = Arc::clone(&controls);
    let (start_tx, start_rx) = unbounded::<StartRequest>();

    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        let lines = BufReader::new(stdin.lock()).lines();
        for line in lines.map_while(Result::ok) {
            if let Ok(message) = serde_json::from_str::<IncomingMessage>(&line) {
                match message {
                    IncomingMessage::Start {
                        scan_id,
                        root,
                        mode,
                        platform,
                        time_budget_ms,
                        max_depth,
                        same_device_only,
                        concurrency,
                        accuracy_mode,
                        deep_policy_preset,
                        elevation_policy,
                        emit_policy,
                        concurrency_policy,
                        skip_basenames,
                        soft_skip_prefixes,
                        skip_dir_suffixes,
                        blocked_prefixes,
                    } => {
                        let request = StartRequest {
                            scan_id,
                            root,
                            mode,
                            platform,
                            time_budget_ms,
                            max_depth,
                            same_device_only,
                            concurrency,
                            accuracy_mode,
                            deep_policy_preset,
                            elevation_policy,
                            emit_policy,
                            concurrency_policy,
                            skip_basenames,
                            soft_skip_prefixes,
                            skip_dir_suffixes,
                            blocked_prefixes,
                        };
                        if start_tx.send(request).is_err() {
                            break;
                        }
                    }
                    IncomingMessage::Pause => {
                        controls_for_stdin.paused.store(true, Ordering::Relaxed);
                    }
                    IncomingMessage::Resume => {
                        controls_for_stdin.paused.store(false, Ordering::Relaxed);
                    }
                    IncomingMessage::Cancel => {
                        controls_for_stdin.cancelled.store(true, Ordering::Relaxed);
                    }
                }
            }
        }
    });

    let stdout = std::io::stdout();
    let mut writer = BufWriter::new(stdout.lock());

    while let Ok(request) = start_rx.recv() {
        initialize_thread_pool(&request);

        let started_at = Instant::now();
        let mut runtime = ScanRuntime {
            request: &request,
            controls: &controls,
            writer: &mut writer,
            started_at,
            stage_started_at: started_at,
            scanned_count: 0,
            permission_errors: 0,
            io_errors: 0,
            blocked_by_policy: 0,
            blocked_by_permission: 0,
            elevation_required: false,
            elevation_signal_emitted: false,
            soft_skipped_by_policy: 0,
            deferred_by_budget: 0,
        };

        let summary = run_scan_loop(&mut runtime)?;
        emit_done(&mut runtime.writer, summary.elapsed_ms, summary.estimated)?;
        runtime.writer.flush()?;
    }

    Ok(())
}

fn initialize_thread_pool(request: &StartRequest) {
    let policy_min = request.concurrency_policy.min.max(1);
    let policy_max = request.concurrency_policy.max.max(policy_min);
    let base_threads = if request.concurrency_policy.adaptive {
        32
    } else {
        request.concurrency.max(1)
    };
    let thread_count = base_threads.max(policy_min).min(policy_max);

    let _ = rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .build_global();
}

fn run_scan_loop<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
) -> Result<scan::aggregate::ScanSummary> {
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

    match runtime.request.mode {
        ScanMode::Quick => scan::quick::run(runtime),
        ScanMode::Deep => scan::deep::run(runtime),
    }
}
