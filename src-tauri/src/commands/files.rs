use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Writes via a sibling temp file + rename so a crash or power loss mid-write
/// never leaves the target file truncated or partially written.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let tmp_path = target.with_file_name(format!(".{file_name}.write-tmp-{}", std::process::id()));

    fs::write(&tmp_path, content.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, target).map_err(|e| e.to_string())
}

/// Writes arbitrary bytes (e.g. an exported PDF) via the same
/// temp-file-then-rename pattern as `write_file`.
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = Path::new(&path);
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let tmp_path = target.with_file_name(format!(".{file_name}.write-tmp-{}", std::process::id()));

    fs::write(&tmp_path, &data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, target).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFileEntry {
    pub name: String,
    pub path: String,
    pub modified_at: i64,
    pub size: u64,
    pub preview: String,
}

/// Lists markdown files under `folder_path`, powering the middle column.
/// Non-recursive by default (immediate files only), matching Finder-column
/// conventions; pass `recursive: true` to opt into a flattened descendant
/// listing via the "Include subfolders" toggle. `include_preview` controls
/// whether each file's content is read to build a preview snippet — callers
/// that only need name/path (e.g. the Cmd+K palette, which recurses across
/// every workspace root) should pass `false` to skip that I/O entirely.
#[tauri::command]
pub fn list_markdown_files(
    folder_path: String,
    recursive: bool,
    include_preview: bool,
) -> Result<Vec<MarkdownFileEntry>, String> {
    let mut entries = Vec::new();
    collect_markdown_files(Path::new(&folder_path), recursive, include_preview, &mut entries)?;
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

fn collect_markdown_files(
    dir: &Path,
    recursive: bool,
    include_preview: bool,
    out: &mut Vec<MarkdownFileEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            if recursive {
                collect_markdown_files(&entry.path(), recursive, include_preview, out)?;
            }
            continue;
        }

        if !name.to_lowercase().ends_with(".md") {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let preview = if include_preview {
            build_preview(&fs::read_to_string(entry.path()).unwrap_or_default())
        } else {
            String::new()
        };

        out.push(MarkdownFileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            modified_at,
            size: metadata.len(),
            preview,
        });
    }

    Ok(())
}

/// Strips a leading YAML frontmatter block and common markdown punctuation,
/// then takes the first ~150 characters as a middle-column preview snippet.
fn build_preview(content: &str) -> String {
    let mut body = content;
    if let Some(stripped) = body.strip_prefix("---\n") {
        if let Some(end) = stripped.find("\n---") {
            body = &stripped[end + 4..];
        }
    }

    let text: String = body
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches(|c: char| "#>-*`".contains(c) || c.is_whitespace())
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    text.chars().take(150).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self as stdfs, File};
    use std::io::Write;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("write-files-test-{name}-{}", std::process::id()));
        let _ = stdfs::remove_dir_all(&dir);
        stdfs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn build_preview_strips_frontmatter_and_punctuation() {
        let content = "---\ntitle: Hello\n---\n# Heading\n\nSome **bold** text here.\n- item one\n";
        let preview = build_preview(content);
        assert_eq!(preview, "Heading Some **bold** text here. item one");
    }

    #[test]
    fn build_preview_truncates_to_150_chars() {
        let long_line = "a".repeat(300);
        let preview = build_preview(&long_line);
        assert_eq!(preview.chars().count(), 150);
    }

    #[test]
    fn list_markdown_files_filters_and_excludes_hidden_and_non_md() {
        let dir = temp_dir("filter");
        File::create(dir.join("note.md")).unwrap().write_all(b"hello").unwrap();
        File::create(dir.join("readme.txt")).unwrap();
        File::create(dir.join(".hidden.md")).unwrap();
        stdfs::create_dir_all(dir.join("sub")).unwrap();
        File::create(dir.join("sub/nested.md")).unwrap();

        let entries = list_markdown_files(dir.to_string_lossy().to_string(), false, true).unwrap();
        let names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        assert_eq!(names, vec!["note.md"]);

        stdfs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn list_markdown_files_skips_content_read_when_preview_disabled() {
        let dir = temp_dir("no-preview");
        File::create(dir.join("note.md")).unwrap().write_all(b"# Heading\nBody text").unwrap();

        let entries = list_markdown_files(dir.to_string_lossy().to_string(), false, false).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].preview, "");

        stdfs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn list_markdown_files_recursive_includes_nested() {
        let dir = temp_dir("recursive");
        File::create(dir.join("top.md")).unwrap();
        stdfs::create_dir_all(dir.join("sub")).unwrap();
        File::create(dir.join("sub/nested.md")).unwrap();

        let entries = list_markdown_files(dir.to_string_lossy().to_string(), true, true).unwrap();
        let mut names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["nested.md", "top.md"]);

        stdfs::remove_dir_all(&dir).unwrap();
    }
}
