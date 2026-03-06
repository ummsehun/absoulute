use std::collections::{HashSet, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;
use crossbeam_channel::{RecvTimeoutError, unbounded};

use crate::platform::{device_id_for_path, same_device};
use crate::protocol::{
    AggBatchItem, Confidence, DeepPolicyPreset, ElevationPolicy, OutgoingMessage, ScanMode,
    StartRequest,
};
use crate::scan::macos_fast;

const FILE_METADATA_CHUNK_SIZE: usize = 64;
const MIN_AGG_BATCH_ITEMS: usize = 64;
const MIN_AGG_BATCH_MS: u64 = 20;
const MIN_PROGRESS_INTERVAL_MS: u64 = 80;
const BATCH_HEARTBEAT_INTERVAL_MS: u64 = 250;
const DEEP_DIRECTORY_BUDGET_MS: u64 = 500;

pub struct ControlState {
    pub paused: AtomicBool,
    pub cancelled: AtomicBool,
}

impl ControlState {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
        }
    }
}

pub struct ScanRuntime<'a, W: Write> {
    pub request: &'a StartRequest,
    pub controls: &'a ControlState,
    pub writer: &'a mut W,
    pub started_at: Instant,
    pub stage_started_at: Instant,
    pub scanned_count: u64,
    pub permission_errors: u64,
    pub io_errors: u64,
    pub blocked_by_policy: u64,
    pub blocked_by_permission: u64,
    pub elevation_required: bool,
    pub elevation_signal_emitted: bool,
    pub soft_skipped_by_policy: u64,
    pub deferred_by_budget: u64,
}

#[derive(Clone, Copy)]
enum PolicyBlockKind {
    Hard,
    SoftSkip,
    DeferredByBudget,
}

#[derive(Clone, Copy)]
pub struct ScanExecutionOptions {
    pub max_depth: usize,
    pub time_budget_ms: u64,
    pub emit_quick_ready: bool,
    pub default_estimated: bool,
}

pub struct ScanSummary {
    pub elapsed_ms: u64,
    pub estimated: bool,
}

struct EmitAccumulator {
    pending_agg: Vec<AggBatchItem>,
    last_agg_emit: Instant,
    last_progress_emit: Instant,
    last_coverage_emit: Instant,
}

impl EmitAccumulator {
    fn new(now: Instant) -> Self {
        Self {
            pending_agg: Vec::new(),
            last_agg_emit: now,
            last_progress_emit: now,
            last_coverage_emit: now,
        }
    }
}

pub fn run_bfs_scan<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    options: ScanExecutionOptions,
) -> Result<ScanSummary> {
    let root = PathBuf::from(&runtime.request.root);
    let mut queue = VecDeque::new();
    queue.push_back((root.clone(), 0_usize));

    let skip_set: HashSet<String> = runtime
        .request
        .skip_basenames
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();
    let is_windows = runtime.request.platform == "win32";
    let blocked_prefixes: Vec<String> = runtime
        .request
        .blocked_prefixes
        .iter()
        .map(|p| normalize_for_compare(p, is_windows))
        .collect();
    let soft_skip_prefixes: Vec<String> = runtime
        .request
        .soft_skip_prefixes
        .iter()
        .map(|p| normalize_for_compare(p, is_windows))
        .collect();
    let skip_dir_suffixes: Vec<String> = runtime
        .request
        .skip_dir_suffixes
        .iter()
        .map(|suffix| suffix.to_ascii_lowercase())
        .collect();
    let root_normalized = normalize_for_compare(&runtime.request.root, is_windows);
    let root_device = if runtime.request.same_device_only {
        device_id_for_path(&root)
    } else {
        None
    };
    let _ = (&runtime.request.scan_id, runtime.request.concurrency);

    let mut estimated = options.default_estimated;
    let mut policy_skipped = false;
    let mut accum = EmitAccumulator::new(Instant::now());
    let use_bulk_estimate = matches!(runtime.request.mode, ScanMode::Quick);
    let deep_responsive_preset = matches!(runtime.request.mode, ScanMode::Deep)
        && matches!(
            runtime.request.deep_policy_preset,
            DeepPolicyPreset::Responsive
        );

    'scan_loop: while let Some((dir_path, depth)) = queue.pop_front() {
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

        if is_blocked_path(&dir_path, &blocked_prefixes, is_windows) {
            policy_skipped = true;
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
            &soft_skip_prefixes,
            &skip_dir_suffixes,
            &root_normalized,
            is_windows,
            deep_responsive_preset,
        ) {
            policy_skipped = true;
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
            Ok(v) => v,
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
        let dir_budget_ms = if deep_responsive_preset {
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
                policy_skipped = true;
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
                Ok(v) => v,
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
            if is_blocked_path(&path, &blocked_prefixes, is_windows) {
                policy_skipped = true;
                on_policy_block(
                    runtime,
                    &mut accum,
                    &path,
                    "Path blocked by policy",
                    PolicyBlockKind::Hard,
                )?;
                continue;
            }

            if is_soft_skipped_by_prefix(&path, &soft_skip_prefixes, &root_normalized, is_windows)
            {
                policy_skipped = true;
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
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if skip_set.contains(&basename) {
                policy_skipped = true;
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
                Ok(v) => v,
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
                if !use_bulk_estimate {
                    file_candidates.push(path.clone());
                    if file_candidates.len() >= FILE_METADATA_CHUNK_SIZE {
                        match process_file_metadata_batch(
                            runtime,
                            &mut accum,
                            &mut file_candidates,
                            &options,
                            &dir_path,
                            queue.len(),
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
                if is_soft_skipped_by_suffix(&path, &skip_dir_suffixes, &root_normalized, is_windows)
                {
                    policy_skipped = true;
                    on_policy_block(
                        runtime,
                        &mut accum,
                        &path,
                        "Path skipped by performance policy",
                        PolicyBlockKind::SoftSkip,
                    )?;
                    continue;
                }
                if runtime.request.same_device_only && !same_device(&path, root_device) {
                    policy_skipped = true;
                    on_policy_block(
                        runtime,
                        &mut accum,
                        &path,
                        "Directory is on a different device",
                        PolicyBlockKind::SoftSkip,
                    )?;
                    continue;
                }
                if depth < options.max_depth {
                    queue.push_back((path.clone(), depth + 1));
                }
            }

            maybe_emit_progress_and_diagnostics(
                runtime,
                &mut accum,
                queue.len(),
                Some(path_to_string(&path)),
                0,
                false,
            )?;
        }

        if use_bulk_estimate {
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
            maybe_emit_progress_and_diagnostics(runtime, &mut accum, queue.len(), None, 0, false)?;
        } else {
            match process_file_metadata_batch(
                runtime,
                &mut accum,
                &mut file_candidates,
                &options,
                &dir_path,
                queue.len(),
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

    if policy_skipped {
        estimated = true;
    }

    flush_agg_batch(runtime, &mut accum, true)?;
    maybe_emit_progress_and_diagnostics(runtime, &mut accum, queue.len(), None, 0, true)?;
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

fn maybe_emit_progress_and_diagnostics<W: Write>(
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

fn maybe_emit_coverage<W: Write>(
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

fn on_policy_block<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    blocked_path: &Path,
    reason: &str,
    kind: PolicyBlockKind,
) -> Result<()> {
    runtime.blocked_by_policy += 1;
    match kind {
        PolicyBlockKind::Hard => {}
        PolicyBlockKind::SoftSkip => {
            runtime.soft_skipped_by_policy += 1;
        }
        PolicyBlockKind::DeferredByBudget => {
            runtime.soft_skipped_by_policy += 1;
            runtime.deferred_by_budget += 1;
        }
    }

    if matches!(kind, PolicyBlockKind::Hard) {
        runtime.elevation_required = true;
        maybe_emit_elevation_required(runtime, blocked_path, reason)?;
    }
    maybe_emit_coverage(runtime, accum, false)
}

fn emit_warning<W: Write>(
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

fn flush_agg_batch<W: Write>(
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

fn map_error_code(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => "E_PERMISSION",
        _ => "E_IO",
    }
}

fn wait_if_paused(controls: &ControlState) {
    while controls.paused.load(Ordering::Relaxed) && !controls.cancelled.load(Ordering::Relaxed)
    {
        thread::sleep(Duration::from_millis(40));
    }
}

fn infer_confidence(scanned_count: u64, permission_errors: u64, io_errors: u64) -> Confidence {
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

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

enum BatchControl {
    Continue,
    TimedOut,
    Cancelled,
}

fn process_file_metadata_batch<W: Write>(
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
    let total_items = batch.len();
    let (tx, rx) = unbounded::<(PathBuf, std::io::Result<u64>)>();
    for file_path in batch {
        let tx_cloned = tx.clone();
        rayon::spawn(move || {
            let size_result = macos_fast::file_len(&file_path);
            let _ = tx_cloned.send((file_path, size_result));
        });
    }
    drop(tx);

    let mut processed_items = 0usize;
    let mut last_path: Option<String> = None;
    let heartbeat_interval = Duration::from_millis(BATCH_HEARTBEAT_INTERVAL_MS);
    let mut last_heartbeat_emit = Instant::now();
    let current_dir_label = path_to_string(current_dir);

    while processed_items < total_items {
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

        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok((file_path, size_result)) => {
                processed_items += 1;
                let path_label = path_to_string(&file_path);
                last_path = Some(path_label.clone());
                match size_result {
                    Ok(size) => {
                        accum.pending_agg.push(AggBatchItem {
                            path: path_label,
                            size_delta: size,
                            count_delta: 1,
                            estimated: false,
                        });
                        flush_agg_batch(runtime, accum, false)?;
                    }
                    Err(error) => {
                        emit_warning(
                            runtime,
                            map_error_code(&error),
                            "Failed to read file metadata",
                            Some(path_label),
                        )?;
                        maybe_emit_coverage(runtime, accum, false)?;
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        if last_heartbeat_emit.elapsed() >= heartbeat_interval {
            let inflight = total_items.saturating_sub(processed_items);
            maybe_emit_progress_and_diagnostics(
                runtime,
                accum,
                queue_len.saturating_add(inflight),
                Some(current_dir_label.clone()),
                inflight,
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

fn is_blocked_path(path: &Path, blocked_prefixes: &[String], is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    blocked_prefixes
        .iter()
        .any(|base| is_same_or_child_path(&candidate, base))
}

fn is_soft_skipped_dir(
    path: &Path,
    soft_skip_prefixes: &[String],
    skip_dir_suffixes: &[String],
    root_normalized: &str,
    is_windows: bool,
    enable_path_rules: bool,
) -> bool {
    is_soft_skipped_by_prefix(path, soft_skip_prefixes, root_normalized, is_windows)
        || is_soft_skipped_by_suffix(path, skip_dir_suffixes, root_normalized, is_windows)
        || (enable_path_rules
            && (is_rustup_doc_or_source_path(path, root_normalized, is_windows)
                || is_nvm_versions_path(path, root_normalized, is_windows)
                || is_pyenv_versions_path(path, root_normalized, is_windows)
                || is_python_venv_packages_path(path, root_normalized, is_windows)
                || is_browser_extensions_path(path, root_normalized, is_windows)
                || is_browser_storage_path(path, root_normalized, is_windows)
                || is_browser_web_app_resources_path(path, root_normalized, is_windows)))
}

fn is_soft_skipped_by_prefix(
    path: &Path,
    soft_skip_prefixes: &[String],
    root_normalized: &str,
    is_windows: bool,
) -> bool {
    if soft_skip_prefixes.is_empty() {
        return false;
    }
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    soft_skip_prefixes
        .iter()
        .any(|base| is_same_or_child_path(&candidate, base))
}

fn is_soft_skipped_by_suffix(
    path: &Path,
    skip_dir_suffixes: &[String],
    root_normalized: &str,
    is_windows: bool,
) -> bool {
    if skip_dir_suffixes.is_empty() {
        return false;
    }
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let basename = path
        .file_name()
        .and_then(|segment| segment.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if basename.is_empty() {
        return false;
    }
    skip_dir_suffixes
        .iter()
        .any(|suffix| basename.ends_with(suffix))
}

fn is_rustup_doc_or_source_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    if !candidate.contains("/.rustup/toolchains/") {
        return false;
    }
    candidate.contains("/share/doc/") || candidate.contains("/lib/rustlib/src/")
}

fn is_nvm_versions_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
  let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
  if candidate == root_normalized {
    return false;
  }
  candidate.contains("/.nvm/versions/")
}

fn is_pyenv_versions_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    candidate.contains("/.pyenv/versions/")
}

fn is_python_venv_packages_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let in_venv = candidate.contains("/venv/") || candidate.contains("/.venv/");
    if !in_venv {
        return false;
    }
    candidate.contains("/site-packages/") || candidate.contains("/dist-packages/")
}

fn is_browser_extensions_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let lower = candidate.to_ascii_lowercase();
    if !lower.contains("/extensions/") {
        return false;
    }

    let browser_roots = [
        "/library/application support/google/chrome/",
        "/library/application support/google/chrome beta/",
        "/library/application support/google/chrome canary/",
        "/library/application support/bravesoftware/brave-browser/",
        "/library/application support/microsoft edge/",
        "/library/application support/vivaldi/",
        "/library/application support/opera",
        "/library/application support/zen/",
        "/library/application support/firefox/",
        "/library/application support/librewolf/",
    ];

    browser_roots.iter().any(|prefix| lower.contains(prefix))
}

fn is_browser_storage_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let lower = candidate.to_ascii_lowercase();
    let browser_roots = [
        "/library/application support/google/chrome/",
        "/library/application support/google/chrome beta/",
        "/library/application support/google/chrome canary/",
        "/library/application support/bravesoftware/brave-browser/",
        "/library/application support/microsoft edge/",
        "/library/application support/vivaldi/",
        "/library/application support/opera",
        "/library/application support/zen/",
        "/library/application support/firefox/",
        "/library/application support/librewolf/",
    ];
    let in_browser_root = browser_roots.iter().any(|prefix| lower.contains(prefix));
    if !in_browser_root {
        return false;
    }

    if lower.contains("/storage/ext/") || lower.contains("/shared dictionary/cache/") {
        return true;
    }
    let is_profile_storage = lower.contains("/profiles/")
        && (lower.contains("/storage/default/")
            || lower.contains("/storage/temporary/")
            || lower.contains("/storage/permanent/"));
    if is_profile_storage
        && (lower.contains("/cache/") || lower.contains("/cache2/") || lower.contains("/morgue/"))
    {
        return true;
    }

    false
}

fn is_browser_web_app_resources_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let lower = candidate.to_ascii_lowercase();
    let browser_roots = [
        "/library/application support/google/chrome/",
        "/library/application support/google/chrome beta/",
        "/library/application support/google/chrome canary/",
        "/library/application support/bravesoftware/brave-browser/",
        "/library/application support/microsoft edge/",
        "/library/application support/vivaldi/",
        "/library/application support/opera",
    ];
    let in_browser_root = browser_roots.iter().any(|prefix| lower.contains(prefix));
    if !in_browser_root {
        return false;
    }

    lower.contains("/web applications/")
        || lower.contains("/manifest resources/")
        || lower.contains("/shortcuts menu icons/")
}

fn normalize_for_compare(raw: &str, is_windows: bool) -> String {
    let normalized = raw.replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    let root_safe = if trimmed.is_empty() { "/" } else { trimmed };
    if is_windows {
        root_safe.to_ascii_lowercase()
    } else {
        root_safe.to_string()
    }
}

fn is_same_or_child_path(candidate: &str, base: &str) -> bool {
    if candidate == base {
        return true;
    }
    let mut prefix = String::with_capacity(base.len() + 1);
    prefix.push_str(base);
    prefix.push('/');
    candidate.starts_with(&prefix)
}
