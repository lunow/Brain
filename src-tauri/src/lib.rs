mod cli;
mod commands;
mod watcher;

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use watcher::WatcherRegistry;

/// The folder passed on the command line at first launch (`brain <folder>`),
/// consumed once by the frontend via `get_launch_folder`. A launch while the
/// app is already running is handled separately, live, by the single-
/// instance plugin below (event "cli://open-folder") — this only covers the
/// process's own first launch, before any frontend listener could exist.
struct LaunchFolder(Mutex<Option<String>>);

#[tauri::command]
fn get_launch_folder(state: tauri::State<'_, LaunchFolder>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"));
    let initial_folder = cli::resolve_cli_folder(&cli_args, &cwd);

    tauri::Builder::default()
        // Must be registered before any other plugin (Tauri requirement).
        // Fires in the FIRST instance whenever `brain <folder>` runs again
        // while it's already open — argv[0] is the executable path, so the
        // folder argument (if any) is argv[1..].
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let args = if argv.len() > 1 { argv[1..].to_vec() } else { Vec::new() };
            if let Some(folder) = cli::resolve_cli_folder(&args, std::path::Path::new(&cwd)) {
                let _ = app.emit("cli://open-folder", folder);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(LaunchFolder(Mutex::new(initial_folder)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherRegistry::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let registry = app.state::<WatcherRegistry>();
            if let Ok(roots) = commands::workspace::get_workspace_roots(app_handle.clone()) {
                for root in roots {
                    watcher::watch_root(&app_handle, &registry, root.id, root.path);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_launch_folder,
            commands::tree::list_dir_children,
            commands::tree::list_all_folders,
            commands::tree::get_folder_stats,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::write_binary_file,
            commands::files::list_markdown_files,
            commands::workspace::get_workspace_roots,
            commands::workspace::add_root_folder,
            commands::workspace::remove_root_folder,
            commands::crud::create_file,
            commands::crud::create_folder,
            commands::crud::rename_entry,
            commands::crud::delete_entry,
            commands::crud::move_entry,
            commands::crud::reveal_in_finder,
            commands::crud::duplicate_entry,
            commands::settings::get_settings,
            commands::settings::set_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
