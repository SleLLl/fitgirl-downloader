mod commands;
mod extractor;
mod scraper;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(extractor::ExtractorState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fetch_parts,
            extractor::extract_links,
            extractor::cancel_extraction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
