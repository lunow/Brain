use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryMeta {
    pub name: String,
    pub path: String,
}

/// Finds a name that doesn't collide with an existing entry in `dir`,
/// appending " 2", " 3", ... before the extension (if any) as needed.
fn dedupe_name(dir: &Path, base_stem: &str, extension: Option<&str>) -> String {
    let make_name = |n: u32| match (extension, n) {
        (Some(ext), 1) => format!("{base_stem}.{ext}"),
        (Some(ext), n) => format!("{base_stem} {n}.{ext}"),
        (None, 1) => base_stem.to_string(),
        (None, n) => format!("{base_stem} {n}"),
    };

    let mut n = 1;
    loop {
        let candidate = make_name(n);
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_file(parent_dir: String, name: String) -> Result<EntryMeta, String> {
    let dir = Path::new(&parent_dir);
    let stem = name.strip_suffix(".md").unwrap_or(&name);
    let final_name = dedupe_name(dir, stem, Some("md"));
    let path = dir.join(&final_name);

    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(EntryMeta {
        name: final_name,
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn create_folder(parent_dir: String, name: String) -> Result<EntryMeta, String> {
    let dir = Path::new(&parent_dir);
    let final_name = dedupe_name(dir, &name, None);
    let path = dir.join(&final_name);

    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(EntryMeta {
        name: final_name,
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn duplicate_entry(path: String) -> Result<EntryMeta, String> {
    let src = Path::new(&path);
    let dir = src.parent().ok_or("Path has no parent directory")?;
    let name = src
        .file_name()
        .ok_or("Path has no file name")?
        .to_string_lossy()
        .to_string();
    let (stem, ext) = split_stem_ext(&name);
    let final_name = dedupe_name(dir, &format!("{stem} copy"), ext.as_deref());
    let dest = dir.join(&final_name);

    if src.is_dir() {
        copy_dir_recursive(src, &dest).map_err(|e| e.to_string())?;
    } else {
        fs::copy(src, &dest).map_err(|e| e.to_string())?;
    }

    Ok(EntryMeta {
        name: final_name,
        path: dest.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    let src = Path::new(&path);
    let parent = src.parent().ok_or("Path has no parent directory")?;
    let dest = parent.join(&new_name);
    fs::rename(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_entry(src_path: String, dest_dir: String) -> Result<String, String> {
    let src = Path::new(&src_path);
    let dir = Path::new(&dest_dir);
    let name = src
        .file_name()
        .ok_or("Source path has no file name")?
        .to_string_lossy()
        .to_string();

    if src.parent() == Some(dir) {
        return Ok(src.to_string_lossy().to_string());
    }

    let stem_and_ext = split_stem_ext(&name);
    let final_name = dedupe_name(dir, &stem_and_ext.0, stem_and_ext.1.as_deref());
    let dest: PathBuf = dir.join(&final_name);

    match fs::rename(src, &dest) {
        Ok(()) => Ok(dest.to_string_lossy().to_string()),
        // Cross-volume moves fail with a rename error; fall back to copy+delete.
        Err(_) => {
            if src.is_dir() {
                copy_dir_recursive(src, &dest).map_err(|e| e.to_string())?;
                fs::remove_dir_all(src).map_err(|e| e.to_string())?;
            } else {
                fs::copy(src, &dest).map_err(|e| e.to_string())?;
                fs::remove_file(src).map_err(|e| e.to_string())?;
            }
            Ok(dest.to_string_lossy().to_string())
        }
    }
}

fn split_stem_ext(name: &str) -> (String, Option<String>) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), Some(ext.to_string())),
        _ => (name.to_string(), None),
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("write-crud-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn create_file_dedupes_name() {
        let dir = temp_dir("create-file-dedupe");
        let first = create_file(dir.to_string_lossy().to_string(), "Untitled".into()).unwrap();
        let second = create_file(dir.to_string_lossy().to_string(), "Untitled".into()).unwrap();
        assert_eq!(first.name, "Untitled.md");
        assert_eq!(second.name, "Untitled 2.md");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_folder_dedupes_name() {
        let dir = temp_dir("create-folder-dedupe");
        fs::create_dir(dir.join("Notes")).unwrap();
        let created = create_folder(dir.to_string_lossy().to_string(), "Notes".into()).unwrap();
        assert_eq!(created.name, "Notes 2");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_entry_moves_file() {
        let dir = temp_dir("rename");
        let src = dir.join("a.md");
        fs::write(&src, "hi").unwrap();
        let new_path = rename_entry(src.to_string_lossy().to_string(), "b.md".into()).unwrap();
        assert!(new_path.ends_with("b.md"));
        assert!(!src.exists());
        assert!(dir.join("b.md").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_entry_dedupes_on_name_collision_at_destination() {
        let dir = temp_dir("move-dedupe");
        let src_dir = dir.join("src");
        let dest_dir = dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        fs::write(src_dir.join("note.md"), "one").unwrap();
        fs::write(dest_dir.join("note.md"), "existing").unwrap();

        let moved = move_entry(
            src_dir.join("note.md").to_string_lossy().to_string(),
            dest_dir.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(moved.ends_with("note 2.md"));
        assert!(!src_dir.join("note.md").exists());
        assert_eq!(fs::read_to_string(dest_dir.join("note.md")).unwrap(), "existing");
        assert_eq!(fs::read_to_string(dest_dir.join("note 2.md")).unwrap(), "one");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_entry_is_noop_when_already_in_destination() {
        let dir = temp_dir("move-noop");
        fs::write(dir.join("note.md"), "hi").unwrap();
        let moved = move_entry(
            dir.join("note.md").to_string_lossy().to_string(),
            dir.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(moved, dir.join("note.md").to_string_lossy().to_string());
        fs::remove_dir_all(&dir).unwrap();
    }
}
