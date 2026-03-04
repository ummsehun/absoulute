use std::io::Write;

use anyhow::Result;

use crate::scan::aggregate::{run_bfs_scan, ScanExecutionOptions, ScanRuntime, ScanSummary};

pub fn run<W: Write>(runtime: &mut ScanRuntime<'_, W>) -> Result<ScanSummary> {
    run_bfs_scan(
        runtime,
        ScanExecutionOptions {
            max_depth: runtime.request.max_depth.max(1),
            time_budget_ms: runtime.request.time_budget_ms,
            emit_quick_ready: true,
            default_estimated: true,
        },
    )
}
