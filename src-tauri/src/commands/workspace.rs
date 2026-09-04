use crate::watcher::{self, WatcherRegistry};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "workspace.json";
const ROOTS_KEY: &str = "roots";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootFolder {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub added_at: i64,
}

fn read_roots(app: &AppHandle) -> Result<Vec<RootFolder>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store
        .get(ROOTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

fn write_roots(app: &AppHandle, roots: &[RootFolder]) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        ROOTS_KEY,
        serde_json::to_value(roots).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// When two or more roots share the same folder name (e.g. several client
/// wikis each named `wiki`), swap the ambiguous ones to their parent
/// directory name so the list reads as project names instead.
fn disambiguate(mut roots: Vec<RootFolder>) -> Vec<RootFolder> {
    let mut counts = std::collections::HashMap::new();
    for r in &roots {
        *counts.entry(r.display_name.clone()).or_insert(0) += 1;
    }
    for r in &mut roots {
        if counts.get(&r.display_name).copied().unwrap_or(0) > 1 {
            if let Some(parent_name) = Path::new(&r.path)
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
            {
                r.display_name = parent_name;
            }
        }
    }
    roots
}

#[tauri::command]
pub fn get_workspace_roots(app: AppHandle) -> Result<Vec<RootFolder>, String> {
    Ok(disambiguate(read_roots(&app)?))
}

#[tauri::command]
pub fn add_root_folder(
    app: AppHandle,
    registry: State<'_, WatcherRegistry>,
    path: String,
) -> Result<RootFolder, String> {
    let mut roots = read_roots(&app)?;

    if let Some(existing) = roots.iter().find(|r| r.path == path) {
        return Ok(existing.clone());
    }

    let display_name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let root = RootFolder {
        id: generate_id(),
        path,
        display_name,
        added_at: now_millis(),
    };

    roots.push(root.clone());
    write_roots(&app, &roots)?;
    watcher::watch_root(&app, &registry, root.id.clone(), root.path.clone());
    Ok(root)
}

#[tauri::command]
pub fn remove_root_folder(
    app: AppHandle,
    registry: State<'_, WatcherRegistry>,
    id: String,
) -> Result<(), String> {
    let mut roots = read_roots(&app)?;
    roots.retain(|r| r.id != id);
    write_roots(&app, &roots)?;
    watcher::unwatch_root(&registry, &id);
    Ok(())
}
