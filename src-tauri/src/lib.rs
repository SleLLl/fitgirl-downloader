mod commands;
mod db;
mod downloader;
mod extractor;
mod library;
mod scraper;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

/// Bring the main window back to the foreground.
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Build the system-tray icon: left-click restores the window, the menu offers
/// Show and Quit. Closing the window only hides it (see on_window_event), so the
/// app keeps running in the tray until Quit.
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("bundled icon").clone())
        .tooltip("FitGirl Downloader")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(extractor::ExtractorState::default())
        .setup(|app| {
            // Open the local SQLite DB in the app-data dir; fall back to an
            // in-memory DB so a DB error never blocks launch.
            let db = std::sync::Arc::new(open_db(app.handle()));
            app.manage(db.clone());
            let manager = downloader::DownloadManager::new(app.handle().clone(), db);
            manager.restore_from_db();
            app.manage(manager);
            setup_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray while downloads are active
            // (so they keep running); with nothing downloading, it really quits.
            // The tray's Quit always exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .state::<downloader::DownloadManager>()
                    .has_active_downloads()
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::fetch_parts,
            commands::scrape_popular,
            commands::scrape_game,
            commands::search_repacks,
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
            downloader::set_setting,
            library::library_games
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
