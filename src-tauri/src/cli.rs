use std::path::{Path, PathBuf};

/// Resolves the `brain <folder>` CLI argument (first non-flag arg) against
/// `cwd` into an absolute, existing-directory path. Returns `None` for
/// anything else — no arg, a path that doesn't exist, or a path that isn't
/// a directory — so a bad invocation is a silent no-op rather than an error
/// dialog or a crash.
pub fn resolve_cli_folder(args: &[String], cwd: &Path) -> Option<String> {
    let arg = args.first()?;
    let candidate = if Path::new(arg).is_absolute() {
        PathBuf::from(arg)
    } else {
        cwd.join(arg)
    };
    let canonical = std::fs::canonicalize(&candidate).ok()?;
    if !canonical.is_dir() {
        return None;
    }
    Some(canonical.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("brain-cli-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_a_relative_arg_against_cwd() {
        let cwd = temp_dir("relative");
        fs::create_dir(cwd.join("notes")).unwrap();
        let resolved = resolve_cli_folder(&["notes".to_string()], &cwd).unwrap();
        assert_eq!(resolved, cwd.join("notes").canonicalize().unwrap().to_string_lossy());
        fs::remove_dir_all(&cwd).unwrap();
    }

    #[test]
    fn resolves_an_absolute_arg_ignoring_cwd() {
        let dir = temp_dir("absolute");
        let resolved = resolve_cli_folder(&[dir.to_string_lossy().to_string()], Path::new("/nonexistent")).unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().to_string_lossy());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn returns_none_for_no_args() {
        assert_eq!(resolve_cli_folder(&[], &std::env::temp_dir()), None);
    }

    #[test]
    fn returns_none_for_a_nonexistent_path() {
        let cwd = temp_dir("missing");
        assert_eq!(resolve_cli_folder(&["nope".to_string()], &cwd), None);
        fs::remove_dir_all(&cwd).unwrap();
    }

    #[test]
    fn returns_none_for_a_file_not_a_directory() {
        let cwd = temp_dir("file");
        fs::write(cwd.join("note.md"), "x").unwrap();
        assert_eq!(resolve_cli_folder(&["note.md".to_string()], &cwd), None);
        fs::remove_dir_all(&cwd).unwrap();
    }
}
