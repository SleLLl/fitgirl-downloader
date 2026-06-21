use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

const INJECT: &str = include_str!("inject.js");

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    pub index: usize,
    pub total: usize,
    pub source_url: String,
    /// "processing" | "needs_click" | "done" | "failed"
    pub status: String,
    pub direct_url: Option<String>,
}

/// Get the existing extractor window, or create it (visible) pointing at `first`.
/// The window is shown so the user can click DOWNLOAD on the fuckingfast page;
/// the injected script captures the resulting URL.
fn ensure_window(app: &AppHandle, first: &str) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("extractor") {
        return Ok(w);
    }
    let url = Url::parse(first).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(app, "extractor", WebviewUrl::External(url))
        .initialization_script(INJECT)
        .visible(true)
        .title("FitGirl Downloader — click DOWNLOAD")
        .inner_size(900.0, 700.0)
        .build()
        .map_err(|e| e.to_string())
}

/// Poll the window URL until the injected script rewrites it to carry the
/// captured `?fflink=<url>`, or the timeout passes. Ignores a link equal to
/// `exclude` (stale URL from the previous part before navigation commits).
async fn wait_for_link(
    win: &WebviewWindow,
    timeout: Duration,
    exclude: Option<&str>,
) -> Option<String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(current) = win.url() {
            if let Some(link) = parse_fflink_url(current.as_str()) {
                if exclude != Some(link.as_str()) {
                    return Some(link);
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    None
}

/// Resolve direct download URLs for each fuckingfast part URL, one at a time.
/// Emits `extract-progress` events; returns the resolved direct URLs in order
/// (failed parts are omitted from the return but reported via events).
#[tauri::command]
pub async fn extract_links(app: AppHandle, urls: Vec<String>) -> Result<Vec<String>, String> {
    let total = urls.len();
    if total == 0 {
        return Ok(vec![]);
    }
    let win = ensure_window(&app, &urls[0])?;
    let _ = win.show();
    let _ = win.set_focus();
    let mut resolved: Vec<String> = Vec::new();
    let mut last: Option<String> = None;

    for (i, src) in urls.iter().enumerate() {
        if let Ok(u) = Url::parse(src) {
            let _ = win.navigate(u);
        }
        // Let the new document begin loading so we don't read a stale title.
        tokio::time::sleep(Duration::from_millis(1200)).await;

        let _ = app.emit(
            "extract-progress",
            ExtractProgress {
                index: i,
                total,
                source_url: src.clone(),
                status: "needs_click".into(),
                direct_url: None,
            },
        );

        // The user clicks DOWNLOAD in the visible window; the injected script
        // captures the URL and rewrites the window URL. Wait for it.
        let link = wait_for_link(&win, Duration::from_secs(180), last.as_deref()).await;

        match link {
            Some(direct) => {
                last = Some(direct.clone());
                resolved.push(direct.clone());
                let _ = app.emit(
                    "extract-progress",
                    ExtractProgress {
                        index: i,
                        total,
                        source_url: src.clone(),
                        status: "done".into(),
                        direct_url: Some(direct),
                    },
                );
            }
            None => {
                let _ = app.emit(
                    "extract-progress",
                    ExtractProgress {
                        index: i,
                        total,
                        source_url: src.clone(),
                        status: "failed".into(),
                        direct_url: None,
                    },
                );
            }
        }
    }

    let _ = win.hide();
    Ok(resolved)
}

/// Extract the captured download URL from the extractor window's current URL,
/// which the injected script rewrites to `<page>?fflink=<encoded-url>`.
pub fn parse_fflink_url(current_url: &str) -> Option<String> {
    let parsed = Url::parse(current_url).ok()?;
    parsed
        .query_pairs()
        .find(|(k, _)| k == "fflink")
        .map(|(_, v)| v.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fflink_query() {
        assert_eq!(
            parse_fflink_url(
                "https://fuckingfast.co/abc?fflink=https%3A%2F%2Fdl.fuckingfast.co%2Fdl%2FXYZ"
            ),
            Some("https://dl.fuckingfast.co/dl/XYZ".to_string())
        );
    }

    #[test]
    fn ignores_url_without_fflink() {
        assert_eq!(parse_fflink_url("https://fuckingfast.co/abc"), None);
        assert_eq!(parse_fflink_url("not a url"), None);
    }
}
