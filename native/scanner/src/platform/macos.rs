use std::path::Path;

pub fn supports_fast_preview() -> bool {
    cfg!(target_os = "macos")
}

pub fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
