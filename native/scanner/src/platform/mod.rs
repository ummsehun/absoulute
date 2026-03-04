pub mod fallback;
pub mod macos;
pub mod windows;

pub use fallback::{device_id_for_path, same_device};
