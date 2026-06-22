use serde::Serialize;

use crate::scraper::{
    fetch_html, parse_part_links, parse_popular, validate_fitgirl_url, Repack,
};

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

/// Scrape FitGirl's popular-repacks page into cards.
#[tauri::command]
pub async fn scrape_popular() -> Result<Vec<Repack>, String> {
    let client = reqwest::Client::new();
    let html = fetch_html(&client, "https://fitgirl-repacks.site/popular-repacks/")
        .await
        .map_err(|e| e.to_string())?;
    Ok(parse_popular(&html))
}
