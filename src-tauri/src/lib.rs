mod commands;
mod watcher;

use tauri::Manager;
use watcher::WatcherRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
