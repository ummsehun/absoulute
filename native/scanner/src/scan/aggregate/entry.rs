use std::fs::DirEntry;
use std::io::Write;
use std::path::PathBuf;

use anyhow::Result;

use crate::platform::same_device;

use super::emit::{emit_warning, maybe_emit_coverage, on_policy_block, EmitAccumulator};
use super::path_utils::path_to_string;
use super::planner::TraversalPlan;
use super::policy::{
    is_blocked_path, is_soft_skipped_by_prefix, is_soft_skipped_by_suffix, map_error_code,
    PolicyBlockKind,
};
use super::{ScanExecutionOptions, ScanRuntime};

pub(crate) enum EntryAction {
    File(PathBuf),
    Directory { path: PathBuf, depth: usize },
    SoftSkipped(PathBuf),
    Skip,
}

pub(crate) fn classify_entry<W: Write>(
    runtime: &mut ScanRuntime<'_, W>,
    accum: &mut EmitAccumulator,
    plan: &TraversalPlan,
    entry: DirEntry,
    depth: usize,
    options: &ScanExecutionOptions,
) -> Result<EntryAction> {
    let path = entry.path();
    runtime.scanned_count += 1;

    if is_blocked_path(&path, &plan.permission_prefixes, plan.is_windows) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Path requires system permission",
            PolicyBlockKind::PermissionRequired,
        )?;
        return Ok(EntryAction::Skip);
    }

    if is_blocked_path(&path, &plan.blocked_prefixes, plan.is_windows) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Path blocked by policy",
            PolicyBlockKind::Hard,
        )?;
        return Ok(EntryAction::Skip);
    }

    if is_soft_skipped_by_prefix(
        &path,
        &plan.soft_skip_prefixes,
        &plan.root_normalized,
        plan.is_windows,
    ) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Path skipped by performance policy",
            PolicyBlockKind::SoftSkip,
        )?;
        return Ok(EntryAction::SoftSkipped(path));
    }

    let basename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if plan.skip_set.contains(&basename) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Path skipped by performance policy",
            PolicyBlockKind::SoftSkip,
        )?;
        return Ok(EntryAction::SoftSkipped(path));
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
            maybe_emit_coverage(runtime, accum, false)?;
            return Ok(EntryAction::Skip);
        }
    };

    if file_type.is_symlink() {
        return Ok(EntryAction::Skip);
    }

    if file_type.is_file() {
        return Ok(EntryAction::File(path));
    }

    if !file_type.is_dir() {
        return Ok(EntryAction::Skip);
    }

    if is_soft_skipped_by_suffix(
        &path,
        &plan.skip_dir_suffixes,
        &plan.root_normalized,
        plan.is_windows,
    ) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Path skipped by performance policy",
            PolicyBlockKind::SoftSkip,
        )?;
        return Ok(EntryAction::SoftSkipped(path));
    }

    if runtime.request.same_device_only && !same_device(&path, plan.root_device) {
        on_policy_block(
            runtime,
            accum,
            &path,
            "Directory is on a different device",
            PolicyBlockKind::ScopeExcluded,
        )?;
        return Ok(EntryAction::Skip);
    }

    if depth < options.max_depth {
        return Ok(EntryAction::Directory {
            path,
            depth: depth + 1,
        });
    }

    Ok(EntryAction::Skip)
}
