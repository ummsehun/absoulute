use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::protocol::{AggBatchItem, OutgoingMessage};
use crate::scan::macos_fast;

use super::emit::{
    emit_message, emit_warning, flush_agg_batch, infer_confidence, maybe_emit_coverage,
    maybe_emit_progress_and_diagnostics, on_policy_block, EmitAccumulator,
};
use super::entry::{classify_entry, EntryAction};
use super::metadata::{process_file_metadata_batch, BatchControl};
use super::path_utils::path_to_string;
use super::planner::plan_traversal;
use super::planner::TraversalPlan;
use super::policy::{is_blocked_path, is_soft_skipped_dir, map_error_code, PolicyBlockKind};
use super::{
    ControlState, ScanExecutionOptions, ScanRuntime, ScanSummary, DEEP_DIRECTORY_BUDGET_MS,
};

enum ScanLoopControl {
    Continue,
    TimedOut,
    Cancelled,
}

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
            &plan.soft_skip_path_rules,
            &plan.root_normalized,
            plan.is_windows,
            plan.deep_responsive_preset,
        ) {
            estimated_by_policy = true;
            emit_soft_skip_estimate(runtime, &mut accum, &dir_path)?;
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
        let dir_budget_ms =
            resolve_directory_budget_ms(plan.deep_responsive_preset, options.time_budget_ms);

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

            if dir_budget_ms > 0 && dir_started_at.elapsed() >= Duration::from_millis(dir_budget_ms)
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

            let action = classify_entry(runtime, &mut accum, &plan, entry, depth, &options)?;
            let current_path = match &action {
                EntryAction::File(path) | EntryAction::Directory { path, .. } => {
                    Some(path_to_string(path))
                }
                EntryAction::SoftSkipped(_) | EntryAction::Skip => None,
            };

            if matches!(action, EntryAction::SoftSkipped(_)) {
                estimated_by_policy = true;
            }
            match apply_entry_action(
                runtime,
                &mut accum,
                &mut plan,
                &mut file_candidates,
                &options,
                &dir_path,
                action,
            )? {
                ScanLoopControl::Continue => {}
                ScanLoopControl::TimedOut => {
                    estimated = true;
                    break 'scan_loop;
                }
                ScanLoopControl::Cancelled => break 'scan_loop,
            }

            maybe_emit_progress_and_diagnostics(
                runtime,
                &mut accum,
                plan.queue.len(),
                current_path,
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
        let confidence = infer_confidence(
            runtime.scanned_count,
            runtime.permission_errors,
            runtime.io_errors,
        );
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

fn apply_entry_action<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    plan: &mut TraversalPlan,
    file_candidates: &mut Vec<PathBuf>,
    options: &ScanExecutionOptions,
    current_dir: &PathBuf,
    action: EntryAction,
) -> Result<ScanLoopControl> {
    match action {
        EntryAction::File(path) => {
            if !plan.use_bulk_estimate {
                file_candidates.push(path);
                if file_candidates.len() >= plan.metadata_batch_size {
                    return map_batch_control(process_file_metadata_batch(
                        runtime,
                        accum,
                        file_candidates,
                        options,
                        current_dir,
                        plan.queue.len(),
                    )?);
                }
            }
        }
        EntryAction::Directory { path, depth } => {
            plan.queue.push_back((path, depth));
        }
        EntryAction::SoftSkipped(path) => {
            emit_soft_skip_estimate(runtime, accum, &path)?;
        }
        EntryAction::Skip => {}
    }

    Ok(ScanLoopControl::Continue)
}

fn emit_soft_skip_estimate<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    path: &Path,
) -> Result<()> {
    let bulk_size = match macos_fast::estimate_dir_size_getattrlistbulk(path) {
        Ok(Some(total)) => total,
        _ => 0,
    };
    let tree_size = estimate_dir_tree_size(path).unwrap_or(0);
    let estimated_size = bulk_size.max(tree_size);

    if estimated_size == 0 {
        return Ok(());
    }

    accum.pending_agg.push(AggBatchItem {
        path: path_to_string(path),
        size_delta: estimated_size,
        count_delta: 0,
        estimated: true,
    });
    flush_agg_batch(runtime, accum, false)
}

fn estimate_dir_tree_size(path: &Path) -> Result<u64> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    if !metadata.is_dir() {
        return Ok(0);
    }

    let mut total = 0_u64;
    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };

    for entry in entries.flatten() {
        total = total.saturating_add(estimate_dir_tree_size(&entry.path()).unwrap_or(0));
    }

    Ok(total)
}

fn map_batch_control(control: BatchControl) -> Result<ScanLoopControl> {
    Ok(match control {
        BatchControl::Continue => ScanLoopControl::Continue,
        BatchControl::TimedOut => ScanLoopControl::TimedOut,
        BatchControl::Cancelled => ScanLoopControl::Cancelled,
    })
}

fn wait_if_paused(controls: &ControlState) {
    while controls.paused.load(Ordering::Relaxed) && !controls.cancelled.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(40));
    }
}

fn resolve_directory_budget_ms(deep_responsive_preset: bool, time_budget_ms: u64) -> u64 {
    if deep_responsive_preset && time_budget_ms > 0 {
        DEEP_DIRECTORY_BUDGET_MS
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_directory_budget_ms;
    use crate::scan::aggregate::DEEP_DIRECTORY_BUDGET_MS;

    #[test]
    fn disables_per_directory_budget_for_unbounded_deep_scans() {
        assert_eq!(resolve_directory_budget_ms(true, 0), 0);
    }

    #[test]
    fn keeps_per_directory_budget_for_bounded_responsive_scans() {
        assert_eq!(
            resolve_directory_budget_ms(true, 500),
            DEEP_DIRECTORY_BUDGET_MS
        );
    }

    #[test]
    fn disables_per_directory_budget_for_exact_scans() {
        assert_eq!(resolve_directory_budget_ms(false, 500), 0);
    }
}
