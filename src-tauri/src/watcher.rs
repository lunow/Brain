use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

type AppDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

#[derive(Default)]
pub struct WatcherRegistry(Mutex<HashMap<String, AppDebouncer>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FsChangedPayload {
    root_id: String,
    paths: Vec<String>,
}

fn is_noise(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

/// Starts a debounced watcher for `path`, emitting `fs://changed` events
/// (~400ms debounce) so the frontend can invalidate its tree/file-list
/// caches and detect external edits to the currently open file.
pub fn watch_root(app: &AppHandle, registry: &WatcherRegistry, root_id: String, path: String) {
    let app_handle = app.clone();
    let root_id_for_handler = root_id.clone();

    let debouncer = new_debouncer(
        Duration::from_millis(400),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let paths: Vec<String> = events
                .iter()
                .flat_map(|e| e.paths.iter())
                .filter(|p| !is_noise(p))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if paths.is_empty() {
                return;
            }
            let _ = app_handle.emit(
                "fs://changed",
                FsChangedPayload {
                    root_id: root_id_for_handler.clone(),
                    paths,
                },
            );
        },
    );

    let Ok(mut debouncer) = debouncer else { return };
    if debouncer.watch(Path::new(&path), RecursiveMode::Recursive).is_err() {
        return;
    }

    registry.0.lock().unwrap().insert(root_id, debouncer);
}

pub fn unwatch_root(registry: &WatcherRegistry, root_id: &str) {
    registry.0.lock().unwrap().remove(root_id);
}
