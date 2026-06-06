use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use anyhow::Result;
use rayon::prelude::*;

use crate::scan::macos_fast;

use super::emit::{
    emit_warning, flush_agg_batch, maybe_emit_coverage, maybe_emit_progress_and_diagnostics,
    EmitAccumulator,
};
use super::path_utils::path_to_string;
use super::policy::map_error_code;
use super::{ScanExecutionOptions, ScanRuntime};

const BATCH_HEARTBEAT_INTERVAL_MS: u64 = 120;

pub(crate) enum BatchControl {
    Continue,
    TimedOut,
    Cancelled,
}

pub(crate) fn process_file_metadata_batch<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    file_candidates: &mut Vec<PathBuf>,
    options: &ScanExecutionOptions,
    current_dir: &Path,
    queue_len: usize,
) -> Result<BatchControl> {
    if file_candidates.is_empty() {
        return Ok(BatchControl::Continue);
    }

    let batch = std::mem::take(file_candidates);
    let mut last_path: Option<String> = None;
    let mut last_heartbeat_emit = Instant::now();
    let current_dir_label = path_to_string(current_dir);

    for results in batch
        .into_par_iter()
        .map(|file_path| {
            let size_result = macos_fast::file_len(&file_path);
            (file_path, size_result)
        })
        .collect::<Vec<_>>()
        .chunks(64)
    {
        if options.time_budget_ms > 0
            && runtime.started_at.elapsed() >= Duration::from_millis(options.time_budget_ms)
        {
            flush_agg_batch(runtime, accum, true)?;
            return Ok(BatchControl::TimedOut);
        }

        if runtime.controls.cancelled.load(Ordering::Relaxed) {
            flush_agg_batch(runtime, accum, true)?;
            return Ok(BatchControl::Cancelled);
        }

        for (file_path, size_result) in results {
            let path_label = path_to_string(file_path);
            last_path = Some(path_label.clone());
            match size_result {
                Ok(size) => {
                    accum.pending_agg.push(crate::protocol::AggBatchItem {
                        path: path_label,
                        size_delta: *size,
                        count_delta: 1,
                        estimated: false,
                    });
                    flush_agg_batch(runtime, accum, false)?;
                }
                Err(error) => {
                    emit_warning(
                        runtime,
                        map_error_code(error),
                        "Failed to read file metadata",
                        Some(path_label),
                    )?;
                    maybe_emit_coverage(runtime, accum, false)?;
                }
            }
        }

        if last_heartbeat_emit.elapsed() >= Duration::from_millis(BATCH_HEARTBEAT_INTERVAL_MS) {
            maybe_emit_progress_and_diagnostics(
                runtime,
                accum,
                queue_len,
                last_path
                    .clone()
                    .or_else(|| Some(current_dir_label.clone())),
                0,
                false,
            )?;
            last_heartbeat_emit = Instant::now();
        }
    }

    maybe_emit_progress_and_diagnostics(
        runtime,
        accum,
        queue_len,
        last_path.or(Some(current_dir_label)),
        0,
        false,
    )?;
    Ok(BatchControl::Continue)
}
