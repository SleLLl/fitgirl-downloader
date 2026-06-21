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
        .manage(extractor::ExtractorState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(downloader::DownloadManager::new(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fetch_parts,
            extractor::extract_links,
            extractor::cancel_extraction,
            downloader::start_downloads,
            downloader::pause_download,
            downloader::resume_download,
            downloader::cancel_download,
            downloader::list_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
