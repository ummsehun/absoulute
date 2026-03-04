use std::collections::{HashSet, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;
use rayon::prelude::*;

use crate::platform::{device_id_for_path, same_device};
use crate::protocol::{Confidence, OutgoingMessage, StartRequest};

const FILE_METADATA_CHUNK_SIZE: usize = 64;

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
    pub scanned_count: u64,
    pub permission_errors: u64,
    pub io_errors: u64,
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
    let root_device = if runtime.request.same_device_only {
        device_id_for_path(&root)
    } else {
        None
    };
    let _ = (&runtime.request.scan_id, runtime.request.concurrency);

    let mut estimated = options.default_estimated;
    let mut policy_skipped = false;
    let mut last_progress_emit = Instant::now();

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
                continue;
            }
        };

        let mut file_candidates: Vec<PathBuf> = Vec::new();

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

            let entry = match entry_res {
                Ok(v) => v,
                Err(error) => {
                    emit_warning(
                        runtime,
                        map_error_code(&error),
                        "Failed to resolve directory entry",
                        Some(path_to_string(&dir_path)),
                    )?;
                    continue;
                }
            };

            let path = entry.path();
            runtime.scanned_count += 1;
            if is_blocked_path(&path, &blocked_prefixes, is_windows) {
                policy_skipped = true;
                continue;
            }

            let basename = path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if skip_set.contains(&basename) {
                policy_skipped = true;
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
                    continue;
                }
            };

            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_file() {
                file_candidates.push(path.clone());
                if file_candidates.len() >= FILE_METADATA_CHUNK_SIZE {
                    match process_file_metadata_batch(
                        runtime,
                        &mut file_candidates,
                        &options,
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
            } else if file_type.is_dir() {
                if runtime.request.same_device_only && !same_device(&path, root_device) {
                    policy_skipped = true;
                    continue;
                }
                if depth < options.max_depth {
                    queue.push_back((path.clone(), depth + 1));
                }
            }

            if runtime.scanned_count % 512 == 0 || last_progress_emit.elapsed() >= Duration::from_millis(180) {
                emit_progress(runtime, queue.len(), Some(path_to_string(&path)))?;
                last_progress_emit = Instant::now();
            }
        }

        match process_file_metadata_batch(runtime, &mut file_candidates, &options, queue.len())? {
            BatchControl::Continue => {}
            BatchControl::TimedOut => {
                estimated = true;
                break 'scan_loop;
            }
            BatchControl::Cancelled => break 'scan_loop,
        }
    }

    if policy_skipped {
        estimated = true;
    }

    if options.emit_quick_ready {
        let confidence = infer_confidence(runtime.scanned_count, runtime.permission_errors, runtime.io_errors);
        emit_message(
            runtime.writer,
            &OutgoingMessage::QuickReady {
                elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
                confidence,
                estimated,
            },
        )?;
    }

    emit_progress(runtime, queue.len(), None)?;

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

fn emit_progress<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    queued_dirs: usize,
    current_path: Option<String>,
) -> Result<()> {
    emit_message(
        runtime.writer,
        &OutgoingMessage::Progress {
            scanned_count: runtime.scanned_count,
            queued_dirs,
            elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
            current_path,
        },
    )
}

fn emit_warning<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    code: &'static str,
    message: &str,
    path: Option<String>,
) -> Result<()> {
    if code == "E_PERMISSION" {
        runtime.permission_errors += 1;
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
    file_candidates: &mut Vec<PathBuf>,
    options: &ScanExecutionOptions,
    queue_len: usize,
) -> Result<BatchControl> {
    if file_candidates.is_empty() {
        return Ok(BatchControl::Continue);
    }

    let batch = std::mem::take(file_candidates);
    let file_metadata_results: Vec<(PathBuf, std::io::Result<u64>)> = batch
        .par_iter()
        .map(|file_path| {
            let size_result = std::fs::metadata(file_path).map(|meta| meta.len());
            (file_path.clone(), size_result)
        })
        .collect();

    let mut last_path: Option<String> = None;
    for (file_path, size_result) in file_metadata_results {
        if options.time_budget_ms > 0
            && runtime.started_at.elapsed() >= Duration::from_millis(options.time_budget_ms)
        {
            return Ok(BatchControl::TimedOut);
        }

        if runtime.controls.cancelled.load(Ordering::Relaxed) {
            return Ok(BatchControl::Cancelled);
        }

        let path_label = path_to_string(&file_path);
        last_path = Some(path_label.clone());
        match size_result {
            Ok(size) => {
                emit_message(
                    runtime.writer,
                    &OutgoingMessage::Agg {
                        path: path_label,
                        size_delta: size,
                        count_delta: 1,
                        estimated: false,
                    },
                )?;
            }
            Err(error) => {
                emit_warning(
                    runtime,
                    map_error_code(&error),
                    "Failed to read file metadata",
                    Some(path_label),
                )?;
            }
        }
    }

    emit_progress(runtime, queue_len, last_path)?;
    Ok(BatchControl::Continue)
}

fn is_blocked_path(path: &Path, blocked_prefixes: &[String], is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    blocked_prefixes
        .iter()
        .any(|base| is_same_or_child_path(&candidate, base))
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
