use std::path::Path;

pub(crate) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub(crate) fn normalize_for_compare(raw: &str, is_windows: bool) -> String {
    let normalized = raw.replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    let root_safe = if trimmed.is_empty() { "/" } else { trimmed };
    if is_windows {
        root_safe.to_ascii_lowercase()
    } else {
        root_safe.to_string()
    }
}

pub(crate) fn is_same_or_child_path(candidate: &str, base: &str) -> bool {
    if candidate == base {
        return true;
    }
    let mut prefix = String::with_capacity(base.len() + 1);
    prefix.push_str(base);
    prefix.push('/');
    candidate.starts_with(&prefix)
}
