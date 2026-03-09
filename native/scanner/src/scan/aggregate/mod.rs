use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

mod emit;
mod metadata;
mod path_utils;
mod policy;
mod walker;

pub use emit::{emit_done, emit_message};
pub use walker::run_bfs_scan;

pub(crate) const FILE_METADATA_CHUNK_SIZE: usize = 256;
pub(crate) const MIN_AGG_BATCH_ITEMS: usize = 64;
pub(crate) const MIN_AGG_BATCH_MS: u64 = 20;
pub(crate) const MIN_PROGRESS_INTERVAL_MS: u64 = 80;
pub(crate) const DEEP_DIRECTORY_BUDGET_MS: u64 = 500;

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
    pub request: &'a crate::protocol::StartRequest,
    pub controls: &'a ControlState,
    pub writer: &'a mut W,
    pub started_at: Instant,
    pub stage_started_at: Instant,
    pub scanned_count: u64,
    pub permission_errors: u64,
    pub io_errors: u64,
    pub blocked_by_policy: u64,
    pub blocked_by_permission: u64,
    pub skipped_by_scope: u64,
    pub elevation_required: bool,
    pub elevation_signal_emitted: bool,
    pub soft_skipped_by_policy: u64,
    pub deferred_by_budget: u64,
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
