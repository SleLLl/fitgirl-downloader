use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use url::Url;

const INJECT: &str = include_str!("inject.js");
const AUTO_TIMEOUT: Duration = Duration::from_secs(12);
const MANUAL_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_RECREATES: u32 = 2;

/// Shared cancellation flag for an in-flight extraction run.
#[derive(Default)]
pub struct ExtractorState {
    pub cancel: Arc<AtomicBool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    pub index: usize,
    pub total: usize,
    pub source_url: String,
    /// "processing" | "needs_captcha" | "done" | "failed" | "cancelled"
    pub status: String,
    pub direct_url: Option<String>,
}

/// Get the existing extractor window, or create it (hidden) pointing at `first`.
fn ensure_window(app: &AppHandle, first: &str) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("extractor") {
        return Ok(w);
    }
    let url = Url::parse(first).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(app, "extractor", WebviewUrl::External(url))
        .initialization_script(INJECT)
        .visible(false)
        .title("FitGirl Downloader — extractor")
        .inner_size(900.0, 700.0)
        .build()
        .map_err(|e| e.to_string())
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

/// Remove duplicate strings, preserving first-seen order.
fn dedup_preserving_order(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for it in items {
        if seen.insert(it.clone()) {
            out.push(it);
        }
    }
    out
}

enum Poll {
    Found(String),
    Timeout,
    Cancelled,
    WindowGone,
}

/// Poll the window URL for the `fflink` payload until timeout, cancellation, or
/// the window disappears. Ignores a link equal to `exclude` (the previous part's
/// URL, before navigation commits).
async fn poll_fflink(
    win: &WebviewWindow,
    timeout: Duration,
    exclude: Option<&str>,
    cancel: &AtomicBool,
) -> Poll {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if cancel.load(Ordering::Relaxed) {
            return Poll::Cancelled;
        }
        match win.url() {
            Ok(current) => {
                if let Some(link) = parse_fflink_url(current.as_str()) {
                    if exclude != Some(link.as_str()) {
                        return Poll::Found(link);
                    }
                }
            }
            Err(_) => return Poll::WindowGone,
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Poll::Timeout
}

enum Outcome {
    Done(String),
    Failed,
    Cancelled,
}

/// Stop the current extraction run (cooperative; checked between polls).
#[tauri::command]
pub fn cancel_extraction(state: State<'_, ExtractorState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Resolve direct download URLs for each fuckingfast part URL. The window stays
/// hidden while auto-click resolves the part; if it times out (likely Turnstile)
/// the window is shown for the user to solve it, then the run resumes. Recreates
/// the window if it disappears. Emits `extract-progress`; returns resolved URLs.
#[tauri::command]
pub async fn extract_links(
    app: AppHandle,
    state: State<'_, ExtractorState>,
    urls: Vec<String>,
) -> Result<Vec<String>, String> {
    let total = urls.len();
    if total == 0 {
        return Ok(vec![]);
    }
    let cancel = state.cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    let mut win = ensure_window(&app, &urls[0])?;
    let mut resolved: Vec<String> = Vec::new();
    let mut last: Option<String> = None;

    'parts: for (i, src) in urls.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
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

        let mut recreates = 0u32;
        let outcome = 'part: loop {
            if let Ok(u) = Url::parse(src) {
                let _ = win.navigate(u);
            }
            // Let the new document begin loading so we don't read a stale URL.
            tokio::time::sleep(Duration::from_millis(1200)).await;

            // Phase 1: hidden auto-click attempt.
            match poll_fflink(&win, AUTO_TIMEOUT, last.as_deref(), &cancel).await {
                Poll::Found(link) => break 'part Outcome::Done(link),
                Poll::Cancelled => break 'part Outcome::Cancelled,
                Poll::WindowGone => {
                    if recreates >= MAX_RECREATES {
                        break 'part Outcome::Failed;
                    }
                    recreates += 1;
                    win = ensure_window(&app, src)?;
                    continue 'part;
                }
                Poll::Timeout => {}
            }

            // Phase 2: show the window so the user can clear Turnstile.
            let _ = win.show();
            let _ = win.set_focus();
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
            match poll_fflink(&win, MANUAL_TIMEOUT, last.as_deref(), &cancel).await {
                Poll::Found(link) => break 'part Outcome::Done(link),
                Poll::Cancelled => break 'part Outcome::Cancelled,
                Poll::WindowGone => {
                    if recreates >= MAX_RECREATES {
                        break 'part Outcome::Failed;
                    }
                    recreates += 1;
                    win = ensure_window(&app, src)?;
                    continue 'part;
                }
                Poll::Timeout => break 'part Outcome::Failed,
            }
        };

        // Keep the window hidden between parts.
        let _ = win.hide();

        match outcome {
            Outcome::Done(direct) => {
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
            Outcome::Failed => {
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
            Outcome::Cancelled => {
                let _ = app.emit(
                    "extract-progress",
                    ExtractProgress {
                        index: i,
                        total,
                        source_url: src.clone(),
                        status: "cancelled".into(),
                        direct_url: None,
                    },
                );
                break 'parts;
            }
        }
    }

    let _ = win.hide();
    Ok(dedup_preserving_order(resolved))
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

    #[test]
    fn dedups_preserving_order() {
        assert_eq!(
            dedup_preserving_order(vec![
                "a".into(),
                "b".into(),
                "a".into(),
                "c".into(),
                "b".into(),
            ]),
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
    }
}
