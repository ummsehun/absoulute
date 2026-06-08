use std::path::Path;

use crate::protocol::SoftSkipPathRule;

use super::path_utils::{is_same_or_child_path, normalize_for_compare};

#[derive(Clone, Copy)]
pub(crate) enum PolicyBlockKind {
    Hard,
    PermissionRequired,
    SoftSkip,
    ScopeExcluded,
}

pub(crate) fn map_error_code(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => "E_PERMISSION",
        _ => "E_IO",
    }
}

pub(crate) fn is_blocked_path(path: &Path, blocked_prefixes: &[String], is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    blocked_prefixes
        .iter()
        .any(|base| is_same_or_child_path(&candidate, base))
}

pub(crate) fn is_soft_skipped_dir(
    path: &Path,
    soft_skip_prefixes: &[String],
    skip_dir_suffixes: &[String],
    soft_skip_path_rules: &[SoftSkipPathRule],
    root_normalized: &str,
    is_windows: bool,
    enable_path_rules: bool,
) -> bool {
    is_soft_skipped_by_prefix(path, soft_skip_prefixes, root_normalized, is_windows)
        || is_soft_skipped_by_suffix(path, skip_dir_suffixes, root_normalized, is_windows)
        || (enable_path_rules
            && is_soft_skipped_by_path_rule(
                path,
                soft_skip_path_rules,
                root_normalized,
                is_windows,
            ))
}

pub(crate) fn is_soft_skipped_by_prefix(
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

pub(crate) fn is_soft_skipped_by_suffix(
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

fn is_soft_skipped_by_path_rule(
    path: &Path,
    rules: &[SoftSkipPathRule],
    root_normalized: &str,
    is_windows: bool,
) -> bool {
    if rules.is_empty() {
        return false;
    }
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let lower = candidate.to_ascii_lowercase();
    rules.iter().any(|rule| {
        if rule.all.is_empty() || !rule.all.iter().all(|fragment| lower.contains(fragment)) {
            return false;
        }
        rule.any.is_empty() || rule.any.iter().any(|fragment| lower.contains(fragment))
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::protocol::SoftSkipPathRule;

    use super::is_soft_skipped_dir;

    #[test]
    fn uses_shared_soft_skip_path_rules() {
        let rules = vec![SoftSkipPathRule {
            all: vec!["/.rustup/toolchains/".to_string()],
            any: vec!["/share/doc/".to_string(), "/lib/rustlib/src/".to_string()],
        }];

        assert!(is_soft_skipped_dir(
            Path::new("/Users/tester/.rustup/toolchains/stable/share/doc/rust"),
            &[],
            &[],
            &rules,
            "/Users/tester",
            false,
            true,
        ));
        assert!(!is_soft_skipped_dir(
            Path::new("/Users/tester/.rustup/toolchains/stable/bin/rustc"),
            &[],
            &[],
            &rules,
            "/Users/tester",
            false,
            true,
        ));
    }
}
