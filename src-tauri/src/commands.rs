use serde::Serialize;

use crate::scraper::{fetch_html, parse_part_links, validate_fitgirl_url};

#[derive(Serialize)]
pub struct FetchResult {
    pub valid: bool,
    pub parts: Vec<String>,
}

/// Validate the URL, fetch the page, and return its fuckingfast part links.
/// `valid: false` means the URL is not on the official FitGirl domain.
#[tauri::command]
pub async fn fetch_parts(url: String) -> Result<FetchResult, String> {
    if !validate_fitgirl_url(&url) {
        return Ok(FetchResult { valid: false, parts: vec![] });
    }
    let client = reqwest::Client::new();
    let html = fetch_html(&client, &url).await.map_err(|e| e.to_string())?;
    let parts = parse_part_links(&html);
    Ok(FetchResult { valid: true, parts })
}
