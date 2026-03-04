use std::collections::{HashSet, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::platform::{device_id_for_path, same_device};
use crate::protocol::{Confidence, OutgoingMessage, StartRequest};

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
    let root_device = if runtime.request.same_device_only {
        device_id_for_path(&root)
    } else {
        None
    };

    let mut estimated = options.default_estimated;
    let mut last_progress_emit = Instant::now();

    while let Some((dir_path, depth)) = queue.pop_front() {
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

        for entry_res in read_dir {
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

            let basename = path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if skip_set.contains(&basename) {
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
                let metadata = match entry.metadata() {
                    Ok(v) => v,
                    Err(error) => {
                        emit_warning(
                            runtime,
                            map_error_code(&error),
                            "Failed to read file metadata",
                            Some(path_to_string(&path)),
                        )?;
                        continue;
                    }
                };

                emit_message(
                    runtime.writer,
                    &OutgoingMessage::Agg {
                        path: path_to_string(&path),
                        size_delta: metadata.len(),
                        count_delta: 1,
                        estimated: false,
                    },
                )?;
            } else if file_type.is_dir() {
                if runtime.request.same_device_only && !same_device(&path, root_device) {
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
