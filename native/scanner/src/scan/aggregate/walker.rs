use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::platform::same_device;
use crate::protocol::{AggBatchItem, OutgoingMessage};
use crate::scan::macos_fast;

use super::emit::{
    emit_message, emit_warning, flush_agg_batch, infer_confidence, maybe_emit_coverage,
    maybe_emit_progress_and_diagnostics, on_policy_block, EmitAccumulator,
};
use super::metadata::{process_file_metadata_batch, BatchControl};
use super::path_utils::path_to_string;
use super::planner::plan_traversal;
use super::policy::{
    is_blocked_path, is_soft_skipped_by_prefix, is_soft_skipped_by_suffix,
    is_soft_skipped_dir, map_error_code, PolicyBlockKind,
};
use super::{
    ControlState, ScanExecutionOptions, ScanRuntime, ScanSummary, DEEP_DIRECTORY_BUDGET_MS,
    FILE_METADATA_CHUNK_SIZE,
};

pub fn run_bfs_scan<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    options: ScanExecutionOptions,
) -> Result<ScanSummary> {
    let mut plan = plan_traversal(runtime.request);
    let _ = (&runtime.request.scan_id, runtime.request.concurrency);

    let mut estimated = options.default_estimated;
    let mut estimated_by_policy = false;
    let mut accum = EmitAccumulator::new(Instant::now());

    'scan_loop: while let Some((dir_path, depth)) = plan.queue.pop_front() {
        if runtime.controls.cancelled.load(Ordering::Relaxed) {
            break;
        }
        wait_if_paused(runtime.controls);

        if options.time_budget_ms > 0
            && runtime.started_at.elapsed() >= Duration::from_millis(options.time_budget_ms)
        {
            estimated = true;
            break;
        }

        if is_blocked_path(&dir_path, &plan.permission_prefixes, plan.is_windows) {
            on_policy_block(
                runtime,
                &mut accum,
                &dir_path,
                "Path requires system permission",
                PolicyBlockKind::PermissionRequired,
            )?;
            continue;
        }

        if is_blocked_path(&dir_path, &plan.blocked_prefixes, plan.is_windows) {
            on_policy_block(
                runtime,
                &mut accum,
                &dir_path,
                "Path blocked by policy",
                PolicyBlockKind::Hard,
            )?;
            continue;
        }

        if is_soft_skipped_dir(
            &dir_path,
            &plan.soft_skip_prefixes,
            &plan.skip_dir_suffixes,
            &plan.root_normalized,
            plan.is_windows,
            plan.deep_responsive_preset,
        ) {
            estimated_by_policy = true;
            on_policy_block(
                runtime,
                &mut accum,
                &dir_path,
                "Path skipped by performance policy",
                PolicyBlockKind::SoftSkip,
            )?;
            continue;
        }

        let read_dir = match std::fs::read_dir(&dir_path) {
            Ok(entries) => entries,
            Err(error) => {
                emit_warning(
                    runtime,
                    map_error_code(&error),
                    "Failed to read directory",
                    Some(path_to_string(&dir_path)),
                )?;
                maybe_emit_coverage(runtime, &mut accum, false)?;
                continue;
            }
        };

        let mut file_candidates: Vec<PathBuf> = Vec::new();
        let dir_started_at = Instant::now();
        let dir_budget_ms = if plan.deep_responsive_preset {
            DEEP_DIRECTORY_BUDGET_MS
        } else {
            0
        };

        for entry_res in read_dir {
            if options.time_budget_ms > 0
                && runtime.started_at.elapsed() >= Duration::from_millis(options.time_budget_ms)
            {
                estimated = true;
                break 'scan_loop;
            }

            if runtime.controls.cancelled.load(Ordering::Relaxed) {
                break;
            }
            wait_if_paused(runtime.controls);

            if dir_budget_ms > 0
                && dir_started_at.elapsed() >= Duration::from_millis(dir_budget_ms)
            {
                estimated_by_policy = true;
                estimated = true;
                on_policy_block(
                    runtime,
                    &mut accum,
                    &dir_path,
                    "Directory deferred by time budget",
                    PolicyBlockKind::DeferredByBudget,
                )?;
                break;
            }

            let entry = match entry_res {
                Ok(entry) => entry,
                Err(error) => {
                    emit_warning(
                        runtime,
                        map_error_code(&error),
                        "Failed to resolve directory entry",
                        Some(path_to_string(&dir_path)),
                    )?;
                    maybe_emit_coverage(runtime, &mut accum, false)?;
                    continue;
                }
            };

            let path = entry.path();
            runtime.scanned_count += 1;
            if is_blocked_path(&path, &plan.permission_prefixes, plan.is_windows) {
                on_policy_block(
                    runtime,
                    &mut accum,
                    &path,
                    "Path requires system permission",
                    PolicyBlockKind::PermissionRequired,
                )?;
                continue;
            }
            if is_blocked_path(&path, &plan.blocked_prefixes, plan.is_windows) {
                on_policy_block(
                    runtime,
                    &mut accum,
                    &path,
                    "Path blocked by policy",
                    PolicyBlockKind::Hard,
                )?;
                continue;
            }

            if is_soft_skipped_by_prefix(
                &path,
                &plan.soft_skip_prefixes,
                &plan.root_normalized,
                plan.is_windows,
            )
            {
                estimated_by_policy = true;
                on_policy_block(
                    runtime,
                    &mut accum,
                    &path,
                    "Path skipped by performance policy",
                    PolicyBlockKind::SoftSkip,
                )?;
                continue;
            }

            let basename = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if plan.skip_set.contains(&basename) {
                estimated_by_policy = true;
                on_policy_block(
                    runtime,
                    &mut accum,
                    &path,
                    "Path skipped by performance policy",
                    PolicyBlockKind::SoftSkip,
                )?;
                continue;
            }

            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    emit_warning(
                        runtime,
                        map_error_code(&error),
                        "Failed to load entry file type",
                        Some(path_to_string(&path)),
                    )?;
                    maybe_emit_coverage(runtime, &mut accum, false)?;
                    continue;
                }
            };

            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_file() {
                if !plan.use_bulk_estimate {
                    file_candidates.push(path.clone());
                    if file_candidates.len() >= FILE_METADATA_CHUNK_SIZE {
                        match process_file_metadata_batch(
                            runtime,
                            &mut accum,
                            &mut file_candidates,
                            &options,
                            &dir_path,
                            plan.queue.len(),
                        )? {
                            BatchControl::Continue => {}
                            BatchControl::TimedOut => {
                                estimated = true;
                                break 'scan_loop;
                            }
                            BatchControl::Cancelled => break 'scan_loop,
                        }
                    }
                }
            } else if file_type.is_dir() {
                if is_soft_skipped_by_suffix(
                    &path,
                    &plan.skip_dir_suffixes,
                    &plan.root_normalized,
                    plan.is_windows,
                ) {
                    estimated_by_policy = true;
                    on_policy_block(
                        runtime,
                        &mut accum,
                        &path,
                        "Path skipped by performance policy",
                        PolicyBlockKind::SoftSkip,
                    )?;
                    continue;
                }
                if runtime.request.same_device_only && !same_device(&path, plan.root_device) {
                    on_policy_block(
                        runtime,
                        &mut accum,
                        &path,
                        "Directory is on a different device",
                        PolicyBlockKind::ScopeExcluded,
                    )?;
                    continue;
                }
                if depth < options.max_depth {
                    plan.queue.push_back((path.clone(), depth + 1));
                }
            }

            maybe_emit_progress_and_diagnostics(
                runtime,
                &mut accum,
                plan.queue.len(),
                Some(path_to_string(&path)),
                0,
                false,
            )?;
        }

        if plan.use_bulk_estimate {
            if let Ok(Some(total)) = macos_fast::estimate_dir_size_getattrlistbulk(&dir_path) {
                if total > 0 {
                    accum.pending_agg.push(AggBatchItem {
                        path: path_to_string(&dir_path),
                        size_delta: total,
                        count_delta: 0,
                        estimated: true,
                    });
                    flush_agg_batch(runtime, &mut accum, false)?;
                }
            }
            maybe_emit_progress_and_diagnostics(
                runtime,
                &mut accum,
                plan.queue.len(),
                None,
                0,
                false,
            )?;
        } else {
            match process_file_metadata_batch(
                runtime,
                &mut accum,
                &mut file_candidates,
                &options,
                &dir_path,
                plan.queue.len(),
            )? {
                BatchControl::Continue => {}
                BatchControl::TimedOut => {
                    estimated = true;
                    break 'scan_loop;
                }
                BatchControl::Cancelled => break 'scan_loop,
            }
        }
    }

    if estimated_by_policy {
        estimated = true;
    }

    flush_agg_batch(runtime, &mut accum, true)?;
    maybe_emit_progress_and_diagnostics(runtime, &mut accum, plan.queue.len(), None, 0, true)?;
    maybe_emit_coverage(runtime, &mut accum, true)?;

    if options.emit_quick_ready {
        let confidence =
            infer_confidence(runtime.scanned_count, runtime.permission_errors, runtime.io_errors);
        emit_message(
            runtime.writer,
            &OutgoingMessage::QuickReady {
                elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
                confidence,
                estimated,
            },
        )?;
    }

    Ok(ScanSummary {
        elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
        estimated,
    })
}

fn wait_if_paused(controls: &ControlState) {
    while controls.paused.load(Ordering::Relaxed) && !controls.cancelled.load(Ordering::Relaxed)
    {
        thread::sleep(Duration::from_millis(40));
    }
}
