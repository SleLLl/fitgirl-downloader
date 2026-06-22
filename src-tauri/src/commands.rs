use serde::Serialize;
use url::Url;

use crate::scraper::{
    fetch_html, parse_game_details, parse_part_links, parse_popular, parse_search,
    validate_fitgirl_url, GameDetails, Repack,
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

/// Search the FitGirl catalog (`?s=query`) and return matching cards.
#[tauri::command]
pub async fn search_repacks(query: String) -> Result<Vec<Repack>, String> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Ok(vec![]);
    }
    let mut url = Url::parse("https://fitgirl-repacks.site/").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("s", trimmed);
    let client = reqwest::Client::new();
    let html = fetch_html(&client, url.as_str())
        .await
        .map_err(|e| e.to_string())?;
    Ok(parse_search(&html))
}

/// Scrape a FitGirl game page into detail fields.
#[tauri::command]
pub async fn scrape_game(url: String) -> Result<GameDetails, String> {
    if !validate_fitgirl_url(&url) {
        return Err("Not an official fitgirl-repacks.site URL.".into());
    }
    let client = reqwest::Client::new();
    let html = fetch_html(&client, &url).await.map_err(|e| e.to_string())?;
    Ok(parse_game_details(&html, &url))
}
