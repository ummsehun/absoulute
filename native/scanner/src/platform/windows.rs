pub fn supports_usn_hint() -> bool {
    cfg!(target_os = "windows")
}
