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
    /// "processing" | "needs_captcha" | "done" | "failed"
    pub status: String,
    pub direct_url: Option<String>,
}

/// Get the existing hidden extractor window, or create it pointing at `first`.
fn ensure_window(app: &AppHandle, first: &str) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("extractor") {
        return Ok(w);
    }
    let url = Url::parse(first).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(app, "extractor", WebviewUrl::External(url))
        .initialization_script(INJECT)
        .visible(false)
        .title("extractor")
        .build()
        .map_err(|e| e.to_string())
}

/// Poll the window title until it carries a sentinel link or the timeout passes.
/// Ignores a link equal to `exclude` (stale title from the previous part).
async fn wait_for_link(
    win: &WebviewWindow,
    timeout: Duration,
    exclude: Option<&str>,
) -> Option<String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(title) = win.title() {
            if let Some(link) = parse_sentinel_title(&title) {
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
    let mut resolved: Vec<String> = Vec::new();
    let mut last: Option<String> = None;

    for (i, src) in urls.iter().enumerate() {
        let _ = app.emit(
            "extract-progress",
            ExtractProgress {
                index: i,
                total,
                source_url: src.clone(),
                status: "processing".into(),
                direct_url: None,
            },
        );

        let nav = win.clone();
        if let Ok(u) = Url::parse(src) {
            let _ = nav.navigate(u);
        }
        // Let the new document begin loading so we don't read a stale title.
        tokio::time::sleep(Duration::from_millis(1200)).await;

        // Automatic attempt (Turnstile usually clears on its own).
        let mut link = wait_for_link(&win, Duration::from_secs(25), last.as_deref()).await;

        // Fallback: show the window so the user can solve the challenge once.
        if link.is_none() {
            let _ = win.show();
            let _ = app.emit(
                "extract-progress",
                ExtractProgress {
                    index: i,
                    total,
                    source_url: src.clone(),
                    status: "needs_captcha".into(),
                    direct_url: None,
                },
            );
            link = wait_for_link(&win, Duration::from_secs(120), last.as_deref()).await;
            let _ = win.hide();
        }

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

    Ok(resolved)
}

/// Prefix the injected page script writes into `document.title` to signal Rust.
pub const SENTINEL: &str = "FFLINK::";

/// Extract the direct URL from a window title if it carries the sentinel.
pub fn parse_sentinel_title(title: &str) -> Option<String> {
    title.strip_prefix(SENTINEL).map(|rest| rest.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sentinel_title() {
        assert_eq!(
            parse_sentinel_title("FFLINK::https://cdn.example/file.rar"),
            Some("https://cdn.example/file.rar".to_string())
        );
    }

    #[test]
    fn ignores_non_sentinel_titles() {
        assert_eq!(parse_sentinel_title("Just a normal page title"), None);
        assert_eq!(parse_sentinel_title(""), None);
    }
}
