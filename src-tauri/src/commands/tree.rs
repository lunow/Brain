use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryLite {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Lists the immediate subdirectories of `path`, powering lazy expansion of
/// the folder tree. Files are excluded here; the middle column lists them
/// separately via `list_markdown_files`.
#[tauri::command]
pub fn list_dir_children(path: String) -> Result<Vec<DirEntryLite>, String> {
    let dir = Path::new(&path);
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_dir() {
            continue;
        }
        entries.push(DirEntryLite {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: true,
        });
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

/// Recursively lists every subfolder under `path`, at any depth — powers
/// the Cmd+K command palette's folder search, unlike `list_dir_children`
/// which only lists one level for lazy tree expansion.
#[tauri::command]
pub fn list_all_folders(path: String) -> Result<Vec<DirEntryLite>, String> {
    let mut entries = Vec::new();
    collect_folders(Path::new(&path), &mut entries)?;
    entries.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(entries)
}

fn collect_folders(dir: &Path, out: &mut Vec<DirEntryLite>) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_dir() {
            continue;
        }
        let child_path = entry.path();
        out.push(DirEntryLite {
            name,
            path: child_path.to_string_lossy().to_string(),
            is_dir: true,
        });
        collect_folders(&child_path, out)?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub folder_count: usize,
    pub file_count: usize,
    pub last_modified_at: Option<i64>,
}

/// Recursively counts subfolders and files under `path` (hidden entries
/// excluded, same convention as `list_dir_children`) and finds the most
/// recent file modification time — powers the left sidebar's per-workspace
/// summary line, shown instead of an expandable subfolder tree.
#[tauri::command]
pub fn get_folder_stats(path: String) -> Result<FolderStats, String> {
    let mut stats = FolderStats {
        folder_count: 0,
        file_count: 0,
        last_modified_at: None,
    };
    collect_stats(Path::new(&path), &mut stats)?;
    Ok(stats)
}

fn collect_stats(dir: &Path, stats: &mut FolderStats) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            stats.folder_count += 1;
            collect_stats(&entry.path(), stats)?;
            continue;
        }

        stats.file_count += 1;
        let modified_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
        if let Some(ms) = modified_at {
            if stats.last_modified_at.is_none_or(|cur| ms > cur) {
                stats.last_modified_at = Some(ms);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn lists_only_visible_subdirectories_sorted_case_insensitively() {
        let tmp = std::env::temp_dir().join(format!("write-tree-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("banana")).unwrap();
        fs::create_dir_all(tmp.join("Apple")).unwrap();
        fs::create_dir_all(tmp.join(".hidden")).unwrap();
        File::create(tmp.join("notes.md")).unwrap();

        let result = list_dir_children(tmp.to_string_lossy().to_string()).unwrap();
        let names: Vec<String> = result.iter().map(|e| e.name.clone()).collect();

        assert_eq!(names, vec!["Apple", "banana"]);
        assert!(result.iter().all(|e| e.is_dir));

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn list_all_folders_recurses_and_excludes_hidden() {
        let tmp = std::env::temp_dir().join(format!("write-tree-recursive-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("a/b")).unwrap();
        fs::create_dir_all(tmp.join(".hidden")).unwrap();
        File::create(tmp.join("a/note.md")).unwrap();

        let result = list_all_folders(tmp.to_string_lossy().to_string()).unwrap();
        let names: Vec<String> = result.iter().map(|e| e.name.clone()).collect();

        assert_eq!(names, vec!["a", "b"]);
        assert!(result.iter().all(|e| e.is_dir));

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn get_folder_stats_counts_recursively_and_excludes_hidden() {
        let tmp = std::env::temp_dir().join(format!("write-tree-stats-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("a/b")).unwrap();
        fs::create_dir_all(tmp.join(".hidden")).unwrap();
        File::create(tmp.join("top.md")).unwrap();
        File::create(tmp.join("a/note.md")).unwrap();
        File::create(tmp.join("a/b/nested.md")).unwrap();
        File::create(tmp.join(".hidden/ignored.md")).unwrap();

        let stats = get_folder_stats(tmp.to_string_lossy().to_string()).unwrap();

        assert_eq!(stats.folder_count, 2);
        assert_eq!(stats.file_count, 3);
        assert!(stats.last_modified_at.is_some());

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn get_folder_stats_empty_folder_has_no_last_modified() {
        let tmp = std::env::temp_dir().join(format!("write-tree-stats-empty-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let stats = get_folder_stats(tmp.to_string_lossy().to_string()).unwrap();

        assert_eq!(stats.folder_count, 0);
        assert_eq!(stats.file_count, 0);
        assert_eq!(stats.last_modified_at, None);

        fs::remove_dir_all(&tmp).unwrap();
    }
}
