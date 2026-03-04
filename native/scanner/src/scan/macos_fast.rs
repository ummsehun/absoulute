use std::io;
use std::path::Path;

#[cfg(target_os = "macos")]
pub fn file_len(path: &Path) -> io::Result<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let bytes = path.as_os_str().as_bytes();
    let c_path = CString::new(bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "path contains NUL byte"))?;

    let mut stat_buf = std::mem::MaybeUninit::<libc::stat>::uninit();
    let status = unsafe {
        libc::fstatat(
            libc::AT_FDCWD,
            c_path.as_ptr(),
            stat_buf.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    };

    if status != 0 {
        return Err(io::Error::last_os_error());
    }

    let stat_buf = unsafe { stat_buf.assume_init() };
    Ok(stat_buf.st_size.max(0) as u64)
}

#[cfg(target_os = "macos")]
pub fn estimate_dir_size_getattrlistbulk(dir_path: &Path) -> io::Result<Option<u64>> {
    use std::ffi::CString;
    use std::mem::size_of;
    use std::os::unix::ffi::OsStrExt;

    #[repr(C)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    #[repr(C)]
    struct AttributeSet {
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    #[repr(C)]
    struct AttrReference {
        attr_dataoffset: i32,
        attr_length: u32,
    }

    const ATTR_BIT_MAP_COUNT: u16 = 5;
    const ATTR_CMN_NAME: u32 = 0x00000001;
    const ATTR_CMN_RETURNED_ATTRS: u32 = 0x80000000;
    const ATTR_FILE_TOTALSIZE: u32 = 0x00000002;
    const FSOPT_PACK_INVAL_ATTRS: u64 = 0x00000008;
    const ATTR_BULK_REQUIRED: u32 = ATTR_CMN_NAME | ATTR_CMN_RETURNED_ATTRS;

    unsafe extern "C" {
        fn getattrlistbulk(
            dirfd: libc::c_int,
            attr_list: *mut libc::c_void,
            attr_buf: *mut libc::c_void,
            attr_buf_size: libc::size_t,
            options: u64,
        ) -> libc::c_int;
    }

    let bytes = dir_path.as_os_str().as_bytes();
    let c_path = CString::new(bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "path contains NUL byte"))?;

    let fd = unsafe {
        libc::open(
            c_path.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    let fd_guard = FdGuard(fd);

    let mut attr_list = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_BULK_REQUIRED,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_TOTALSIZE,
        forkattr: 0,
    };

    let mut buffer = vec![0u8; 64 * 1024];
    let mut total = 0u64;

    loop {
        let read_count = unsafe {
            getattrlistbulk(
                fd_guard.0,
                &mut attr_list as *mut AttrList as *mut libc::c_void,
                buffer.as_mut_ptr() as *mut libc::c_void,
                buffer.len(),
                FSOPT_PACK_INVAL_ATTRS,
            )
        };

        if read_count < 0 {
            let err = io::Error::last_os_error();
            if err.raw_os_error() == Some(libc::ENOTSUP) {
                return Ok(None);
            }
            return Err(err);
        }

        if read_count == 0 {
            break;
        }

        let mut offset = 0usize;
        for _ in 0..read_count {
            if offset + size_of::<u32>() > buffer.len() {
                break;
            }

            let record_length = u32::from_ne_bytes(
                buffer[offset..offset + size_of::<u32>()]
                    .try_into()
                    .unwrap_or([0_u8; 4]),
            ) as usize;
            if record_length < size_of::<u32>() || offset + record_length > buffer.len() {
                break;
            }

            let record_end = offset + record_length;
            let mut cursor = offset + size_of::<u32>();

            if cursor + size_of::<AttributeSet>() > record_end {
                offset = record_end;
                continue;
            }
            let attrs = unsafe {
                (buffer.as_ptr().add(cursor) as *const AttributeSet).read_unaligned()
            };
            cursor += size_of::<AttributeSet>();

            if cursor + size_of::<AttrReference>() > record_end {
                offset = record_end;
                continue;
            }
            cursor += size_of::<AttrReference>();

            if attrs.fileattr & ATTR_FILE_TOTALSIZE != 0 {
                if cursor + size_of::<u64>() <= record_end {
                    let size = u64::from_ne_bytes(
                        buffer[cursor..cursor + size_of::<u64>()]
                            .try_into()
                            .unwrap_or([0_u8; 8]),
                    );
                    total = total.saturating_add(size);
                }
            }

            offset = record_end;
        }
    }

    Ok(Some(total))
}

#[cfg(not(target_os = "macos"))]
pub fn file_len(path: &Path) -> io::Result<u64> {
    std::fs::metadata(path).map(|meta| meta.len())
}

#[cfg(not(target_os = "macos"))]
pub fn estimate_dir_size_getattrlistbulk(_dir_path: &Path) -> io::Result<Option<u64>> {
    Ok(None)
}

#[cfg(target_os = "macos")]
struct FdGuard(libc::c_int);

#[cfg(target_os = "macos")]
impl Drop for FdGuard {
    fn drop(&mut self) {
        unsafe {
            libc::close(self.0);
        }
    }
}
