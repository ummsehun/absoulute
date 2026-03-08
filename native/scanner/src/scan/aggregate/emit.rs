use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::protocol::{Confidence, ElevationPolicy, OutgoingMessage};

use super::path_utils::path_to_string;
use super::policy::PolicyBlockKind;
use super::{ScanRuntime, MIN_AGG_BATCH_ITEMS, MIN_AGG_BATCH_MS, MIN_PROGRESS_INTERVAL_MS};

pub(crate) struct EmitAccumulator {
    pub(crate) pending_agg: Vec<crate::protocol::AggBatchItem>,
    pub(crate) last_agg_emit: Instant,
    pub(crate) last_progress_emit: Instant,
    pub(crate) last_coverage_emit: Instant,
}

impl EmitAccumulator {
    pub(crate) fn new(now: Instant) -> Self {
        Self {
            pending_agg: Vec::new(),
            last_agg_emit: now,
            last_progress_emit: now,
            last_coverage_emit: now,
        }
    }
}

pub fn emit_done<W: Write>(writer: &mut W, elapsed_ms: u64, estimated: bool) -> Result<()> {
    emit_message(
        writer,
        &OutgoingMessage::Done {
            elapsed_ms,
            estimated,
        },
    )
}

pub fn emit_message<W: Write>(writer: &mut W, message: &OutgoingMessage) -> Result<()> {
    serde_json::to_writer(&mut *writer, message)?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

pub(crate) fn maybe_emit_progress_and_diagnostics<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    queued_dirs: usize,
    current_path: Option<String>,
    inflight: usize,
    force: bool,
) -> Result<()> {
    let now = Instant::now();
    let progress_interval = Duration::from_millis(
        runtime
            .request
            .emit_policy
            .progress_interval_ms
            .max(MIN_PROGRESS_INTERVAL_MS),
    );

    if !force && now.duration_since(accum.last_progress_emit) < progress_interval {
        return Ok(());
    }

    emit_message(
        runtime.writer,
        &OutgoingMessage::Progress {
            scanned_count: runtime.scanned_count,
            queued_dirs,
            elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
            current_path: current_path.clone(),
        },
    )?;

    let elapsed_ms = runtime.started_at.elapsed().as_millis() as u64;
    let files_per_sec = if elapsed_ms == 0 {
        0.0
    } else {
        runtime.scanned_count as f64 / (elapsed_ms as f64 / 1000.0)
    };
    let issue_ratio = (runtime.permission_errors + runtime.io_errors) as f64
        / (runtime.scanned_count.max(1) as f64);
    let io_wait_ratio = issue_ratio.min(0.95);

    emit_message(
        runtime.writer,
        &OutgoingMessage::Diagnostics {
            files_per_sec,
            stage_elapsed_ms: runtime.stage_started_at.elapsed().as_millis() as u64,
            io_wait_ratio,
            queue_depth: queued_dirs,
            hot_path: current_path,
            soft_skipped_by_policy: runtime.soft_skipped_by_policy,
            deferred_by_budget: runtime.deferred_by_budget,
            inflight,
        },
    )?;

    accum.last_progress_emit = now;
    Ok(())
}

pub(crate) fn maybe_emit_coverage<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    force: bool,
) -> Result<()> {
    let now = Instant::now();
    if !force && now.duration_since(accum.last_coverage_emit) < Duration::from_millis(300) {
        return Ok(());
    }

    emit_message(
        runtime.writer,
        &OutgoingMessage::Coverage {
            scanned: runtime.scanned_count,
            blocked_by_policy: runtime.blocked_by_policy,
            blocked_by_permission: runtime.blocked_by_permission,
            skipped_by_scope: runtime.skipped_by_scope,
            elevation_required: runtime.elevation_required,
        },
    )?;
    accum.last_coverage_emit = now;
    Ok(())
}

fn maybe_emit_elevation_required<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    path: &Path,
    reason: &str,
) -> Result<()> {
    if runtime.elevation_signal_emitted
        || matches!(runtime.request.elevation_policy, ElevationPolicy::None)
    {
        return Ok(());
    }

    emit_message(
        runtime.writer,
        &OutgoingMessage::ElevationRequired {
            target_path: path_to_string(path),
            reason: reason.to_string(),
            policy: runtime.request.elevation_policy,
        },
    )?;
    runtime.elevation_signal_emitted = true;
    Ok(())
}

pub(crate) fn on_policy_block<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    blocked_path: &Path,
    reason: &str,
    kind: PolicyBlockKind,
) -> Result<()> {
    match kind {
        PolicyBlockKind::Hard => {
            runtime.blocked_by_policy += 1;
        }
        PolicyBlockKind::PermissionRequired => {
            runtime.blocked_by_permission += 1;
        }
        PolicyBlockKind::SoftSkip => {
            runtime.blocked_by_policy += 1;
            runtime.soft_skipped_by_policy += 1;
        }
        PolicyBlockKind::DeferredByBudget => {
            runtime.blocked_by_policy += 1;
            runtime.soft_skipped_by_policy += 1;
            runtime.deferred_by_budget += 1;
        }
        PolicyBlockKind::ScopeExcluded => {
            runtime.skipped_by_scope += 1;
        }
    }

    if matches!(kind, PolicyBlockKind::Hard | PolicyBlockKind::PermissionRequired) {
        runtime.elevation_required = true;
        maybe_emit_elevation_required(runtime, blocked_path, reason)?;
    }
    maybe_emit_coverage(runtime, accum, false)
}

pub(crate) fn emit_warning<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    code: &'static str,
    message: &str,
    path: Option<String>,
) -> Result<()> {
    if code == "E_PERMISSION" {
        runtime.permission_errors += 1;
        runtime.blocked_by_permission += 1;
        runtime.elevation_required = true;
    } else {
        runtime.io_errors += 1;
    }

    emit_message(
        runtime.writer,
        &OutgoingMessage::Warn {
            code: code.to_string(),
            message: message.to_string(),
            path,
            recoverable: true,
        },
    )
}

pub(crate) fn flush_agg_batch<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    force: bool,
) -> Result<()> {
    if accum.pending_agg.is_empty() {
        return Ok(());
    }

    let max_items = runtime
        .request
        .emit_policy
        .agg_batch_max_items
        .max(MIN_AGG_BATCH_ITEMS);
    let max_interval = Duration::from_millis(
        runtime
            .request
            .emit_policy
            .agg_batch_max_ms
            .max(MIN_AGG_BATCH_MS),
    );

    let should_emit = force
        || accum.pending_agg.len() >= max_items
        || accum.last_agg_emit.elapsed() >= max_interval;
    if !should_emit {
        return Ok(());
    }

    let items = std::mem::take(&mut accum.pending_agg);
    emit_message(runtime.writer, &OutgoingMessage::AggBatch { items })?;
    accum.last_agg_emit = Instant::now();
    Ok(())
}

pub(crate) fn infer_confidence(
    scanned_count: u64,
    permission_errors: u64,
    io_errors: u64,
) -> Confidence {
    if scanned_count == 0 {
        return Confidence::Low;
    }

    let ratio = (permission_errors + io_errors) as f64 / scanned_count as f64;
    if ratio > 0.2 {
        return Confidence::Low;
    }
    if ratio > 0.08 {
        return Confidence::Medium;
    }

    Confidence::High
}
