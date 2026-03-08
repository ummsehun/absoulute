use std::path::Path;

use super::path_utils::{is_same_or_child_path, normalize_for_compare};

#[derive(Clone, Copy)]
pub(crate) enum PolicyBlockKind {
    Hard,
    PermissionRequired,
    SoftSkip,
    DeferredByBudget,
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
                || is_kakao_talk_chat_tag_path(path, root_normalized, is_windows)
                || is_browser_extensions_path(path, root_normalized, is_windows)
                || is_browser_storage_path(path, root_normalized, is_windows)
                || is_browser_web_app_resources_path(path, root_normalized, is_windows)))
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

fn is_kakao_talk_chat_tag_path(path: &Path, root_normalized: &str, is_windows: bool) -> bool {
    let candidate = normalize_for_compare(&path.to_string_lossy(), is_windows);
    if candidate == root_normalized {
        return false;
    }
    let lower = candidate.to_ascii_lowercase();
    lower.contains(
        "/library/containers/com.kakao.kakaotalkmac/data/library/application support/com.kakao.kakaotalkmac/",
    ) && lower.contains("/commonresource/mychattag")
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
