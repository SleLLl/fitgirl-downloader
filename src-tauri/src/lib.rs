mod commands;
mod db;
mod downloader;
mod extractor;
mod scraper;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // NOTE: the updater plugin panics at startup unless `plugins.updater`
        // (endpoints + pubkey) exists in tauri.conf.json. Re-enable this line
        // TOGETHER with adding that config block (needs the real pubkey):
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(extractor::ExtractorState::default())
        .setup(|app| {
            // Open the local SQLite DB in the app-data dir; fall back to an
            // in-memory DB so a DB error never blocks launch.
            let db = std::sync::Arc::new(open_db(app.handle()));
            app.manage(db.clone());
            let manager = downloader::DownloadManager::new(app.handle().clone(), db);
            manager.restore_from_db();
            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fetch_parts,
            commands::scrape_popular,
            extractor::extract_links,
            extractor::cancel_extraction,
            downloader::start_downloads,
            downloader::pause_download,
            downloader::resume_download,
            downloader::resume_all,
            downloader::cancel_download,
            downloader::remove_download,
            downloader::clear_finished,
            downloader::list_downloads,
            downloader::get_settings,
            downloader::set_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn open_db(app: &tauri::AppHandle) -> db::Db {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("fitgirl-downloader.db");
        if let Some(p) = path.to_str() {
            if let Ok(db) = db::Db::open(p) {
                return db;
            }
        }
    }
    db::Db::open_in_memory().expect("in-memory DB")
}
