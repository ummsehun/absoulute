use std::path::Path;

#[cfg(unix)]
pub fn device_id_for_path(path: &Path) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).ok().map(|meta| meta.dev())
}

#[cfg(not(unix))]
pub fn device_id_for_path(_path: &Path) -> Option<u64> {
    None
}

pub fn same_device(path: &Path, root_device_id: Option<u64>) -> bool {
    match root_device_id {
        Some(root_dev) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                return std::fs::metadata(path)
                    .ok()
                    .map(|meta| meta.dev() == root_dev)
                    .unwrap_or(false);
            }
            #[cfg(not(unix))]
            {
                let _ = root_dev;
                true
            }
        }
        None => true,
    }
}
