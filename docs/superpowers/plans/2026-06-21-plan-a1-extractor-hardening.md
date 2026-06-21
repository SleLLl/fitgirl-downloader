# Plan A.1 — Extractor Hardening & Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make link extraction automatic (auto-click DOWNLOAD, window hidden unless a Turnstile challenge needs a human) and resilient (cancel a run, recreate a closed window, never hang on one part, retry only failed parts), plus defensive dedup.

**Architecture:** The injected script auto-clicks the DOWNLOAD control until it captures the `window.open(dl…)` URL and transports it via `?fflink=`. The Rust `extract_links` command runs the window hidden, polls `win.url()`, shows the window only when a part times out (Turnstile), recreates the window if it disappears, and checks a shared `AtomicBool` cancel flag between polls. The frontend gains Cancel and Retry-failed controls.

**Tech Stack:** Tauri v2, Rust (`tokio`, `url`, `std::sync::atomic`), React + TypeScript, vitest + Testing Library.

---

## File Structure (Plan A.1)

- `src-tauri/src/scraper.rs` — add trailing-slash normalization before dedup in `parse_part_links`.
- `src-tauri/src/extractor/mod.rs` — full rewrite: `ExtractorState` (cancel flag), hidden/auto + show-on-Turnstile per-part flow, window recreation, `cancel_extraction` command, result dedup. Keeps `parse_fflink_url`.
- `src-tauri/src/extractor/inject.js` — guard against post-capture pages + DOWNLOAD auto-click loop.
- `src-tauri/src/lib.rs` — `manage(ExtractorState)` + register `cancel_extraction`.
- `src/lib/extract.ts` — `failedSourceUrls(results)` helper (+ test).
- `src/lib/api.ts` — `cancelExtraction()` wrapper; widen `ExtractStatus`.
- `src/pages/Game.tsx` + `src/pages/Game.css` — Cancel + Retry-failed buttons, status text.

**Environment note (every task):** Windows. In the Bash tool, run cargo with `export PATH="$HOME/.cargo/bin:$PATH"` from `src-tauri`. Do NOT run `npm run tauri dev` / `cargo run` (blocking GUI) — verify with `cargo test` / `cargo build` / `npm test` / `npm run build`. Git identity is configured. Current branch: `feat/extractor-hardening`.

---

### Task 1: Trailing-slash normalization in `parse_part_links` (TDD)

**Files:**
- Modify: `src-tauri/src/scraper.rs`

- [ ] **Step 1: Write the failing test**

Add inside the existing `#[cfg(test)] mod tests` block in `src-tauri/src/scraper.rs`:

```rust
    #[test]
    fn normalizes_trailing_slash_before_dedup() {
        let html = r#"<a href="https://fuckingfast.co/abc">a</a>
                      <a href="https://fuckingfast.co/abc/">b</a>"#;
        assert_eq!(
            parse_part_links(html),
            vec!["https://fuckingfast.co/abc".to_string()]
        );
    }
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test normalizes_trailing_slash_before_dedup
```

Expected: FAIL — currently the two hrefs are treated as distinct, so the vec has 2 items.

- [ ] **Step 3: Implement normalization**

In `src-tauri/src/scraper.rs`, add this helper above `parse_part_links`:

```rust
/// Drop a single trailing slash so `.../abc` and `.../abc/` dedup together.
fn normalize_part_url(href: &str) -> String {
    href.strip_suffix('/').unwrap_or(href).to_string()
}
```

Then in `parse_part_links`, change the line `let owned = href.to_string();` to:

```rust
                let owned = normalize_part_url(href);
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test
```

Expected: PASS — including the existing `extracts_unique_fuckingfast_links_in_order` (its fixture links end in `.rar`, unaffected).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scraper.rs
git commit -m "feat: normalize trailing slash in part-link dedup"
```

---

### Task 2: DOWNLOAD auto-click in `inject.js`

**Files:**
- Modify: `src-tauri/src/extractor/inject.js`

This file is browser-side; it is verified by the manual checklist (Task 7). The change keeps the existing capture/transport and adds (a) a guard so the post-capture `?fflink=` page does nothing, and (b) an interval that clicks the DOWNLOAD control until capture.

- [ ] **Step 1: Replace the file contents**

Replace all of `src-tauri/src/extractor/inject.js` with:

```js
// Injected into every fuckingfast.co page load in the extractor window.
//
// The direct download URL appears only when the DOWNLOAD button is clicked (its
// handler calls window.open(<dl.fuckingfast.co/dl/...>)). We auto-click that
// button until the URL is captured, hook window.open to grab it (suppressing the
// ad popup), and transport it to Rust by rewriting our URL to
// `<page>?fflink=<encoded>` (Rust reads window.url()).
(function () {
  // On the post-capture page we already did our job — do nothing.
  if (window.location.search.indexOf("fflink=") !== -1) return;

  var captured = null;

  // A real download URL looks like a file or sits on the file host; ad popups
  // (also window.open) usually do neither.
  function looksLikeDownload(u) {
    return (
      /\.(rar|zip|7z|bin|exe|iso|part\d+)(\?|#|$)/i.test(u) ||
      /fuckingfast/i.test(u)
    );
  }

  function capture(url) {
    if (captured || !url) return;
    if (/^https?:\/\//.test(url) && looksLikeDownload(url)) {
      captured = url;
      window.location.search = "fflink=" + encodeURIComponent(url);
    }
  }

  // Capture any window.open and suppress the popup.
  window.open = function (url) {
    capture(url);
    return null;
  };

  // If the DOWNLOAD control is an anchor, also read its href on click.
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) capture(a.href);
    },
    true
  );

  // Auto-click the DOWNLOAD control until a link is captured, so the user does
  // not have to. Repeated clicks are safe (popups suppressed). Under a Turnstile
  // challenge the control is absent/inert and clicks no-op until it is cleared.
  var attempts = 0;
  var timer = setInterval(function () {
    if (captured || attempts >= 40) {
      clearInterval(timer);
      return;
    }
    attempts++;
    var els = document.querySelectorAll("a,button");
    for (var i = 0; i < els.length; i++) {
      if (/download/i.test(els[i].textContent || "")) {
        try {
          els[i].click();
        } catch (e) {}
        break;
      }
    }
  }, 800);
})();
```

- [ ] **Step 2: Verify it is embedded (compile happens in Task 3)**

```bash
grep -n "Auto-click" /e/dev/fitgirl-downloader/src-tauri/src/extractor/inject.js
```

Expected: prints the auto-click comment line.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/extractor/inject.js
git commit -m "feat: auto-click DOWNLOAD button in extractor inject script"
```

---

### Task 3: Rewrite `extractor/mod.rs` — state, cancel, hidden/Turnstile flow, recreate, dedup

**Files:**
- Modify (full replace): `src-tauri/src/extractor/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the dedup unit test first**

You will replace the whole file in Step 2; that replacement INCLUDES this test, so this step is just to note the expected behavior — the new `dedup_preserving_order` must turn `["a","b","a","c","b"]` into `["a","b","c"]`. (Verified by `cargo test` in Step 4.)

- [ ] **Step 2: Replace `src-tauri/src/extractor/mod.rs` entirely with**

```rust
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
```

- [ ] **Step 3: Register state + the cancel command in `lib.rs`**

In `src-tauri/src/lib.rs`, add `.manage(...)` before `.invoke_handler(...)` and add `extractor::cancel_extraction` to the handler list. The builder becomes:

```rust
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
```

- [ ] **Step 4: Build and run tests**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo build && cargo test
```

Expected: compiles; tests pass (`parses_fflink_query`, `ignores_url_without_fflink`, `dedups_preserving_order`, plus the scraper tests). If the async command rejects `State<'_, ExtractorState>` across an `.await` (Send error), note that `state.cancel` is cloned into `cancel` immediately and `state` is not touched afterward — `ExtractorState` is `Send + Sync`, so the future is `Send`; do not remove the `State` param.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/extractor/mod.rs src-tauri/src/lib.rs
git commit -m "feat: cancel flag, hidden/Turnstile flow, window recreate, result dedup"
```

---

### Task 4: Frontend API — `failedSourceUrls` helper (TDD) + `api.ts` updates

**Files:**
- Create: `src/lib/extract.ts`, `src/lib/extract.test.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { failedSourceUrls } from "./extract";
import type { ExtractProgress } from "./api";

const p = (sourceUrl: string, status: ExtractProgress["status"]): ExtractProgress => ({
  index: 0,
  total: 1,
  sourceUrl,
  status,
  directUrl: null,
});

describe("failedSourceUrls", () => {
  it("returns only the source URLs whose status is failed", () => {
    const results: Record<string, ExtractProgress> = {
      a: p("a", "done"),
      b: p("b", "failed"),
      c: p("c", "failed"),
      d: p("d", "needs_captcha"),
    };
    expect(failedSourceUrls(results).sort()).toEqual(["b", "c"]);
  });

  it("returns empty when nothing failed", () => {
    expect(failedSourceUrls({ a: p("a", "done") })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd /e/dev/fitgirl-downloader && npm test
```

Expected: FAIL — cannot resolve `./extract`.

- [ ] **Step 3: Create `src/lib/extract.ts`**

```ts
import type { ExtractProgress } from "./api";

/// Source URLs whose latest extraction status is "failed".
export function failedSourceUrls(
  results: Record<string, ExtractProgress>
): string[] {
  return Object.values(results)
    .filter((p) => p.status === "failed")
    .map((p) => p.sourceUrl);
}
```

- [ ] **Step 4: Widen `ExtractStatus` and add `cancelExtraction` in `src/lib/api.ts`**

Replace the `ExtractStatus` line in `src/lib/api.ts` with:

```ts
export type ExtractStatus =
  | "processing"
  | "needs_captcha"
  | "done"
  | "failed"
  | "cancelled";
```

And add this function at the end of `src/lib/api.ts`:

```ts
export function cancelExtraction(): Promise<void> {
  return invoke<void>("cancel_extraction");
}
```

- [ ] **Step 5: Run tests + type-check**

```bash
cd /e/dev/fitgirl-downloader && npm test && npm run build
```

Expected: vitest PASS (both `failedSourceUrls` cases + existing); `npm run build` type-checks clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extract.ts src/lib/extract.test.ts src/lib/api.ts
git commit -m "feat: failedSourceUrls helper, cancelExtraction wrapper, status union"
```

---

### Task 5: Game UI — Cancel + Retry-failed controls (component test)

**Files:**
- Modify: `src/pages/Game.tsx`
- Modify: `src/pages/Game.test.tsx`

- [ ] **Step 1: Update imports and the status message in `src/pages/Game.tsx`**

Change the api import block and add the extract import. Replace:

```tsx
import {
  extractLinks,
  fetchParts,
  onExtractProgress,
  type ExtractProgress,
} from "@/lib/api";
import { filenameFromUrl } from "@/lib/format";
```

with:

```tsx
import {
  cancelExtraction,
  extractLinks,
  fetchParts,
  onExtractProgress,
  type ExtractProgress,
} from "@/lib/api";
import { failedSourceUrls } from "@/lib/extract";
import { filenameFromUrl } from "@/lib/format";
```

Then change the status message branch from `needs_click` to `needs_captcha`:

```tsx
        `Extracting ${p.index + 1}/${p.total} — ${p.status}` +
          (p.status === "needs_captcha"
            ? " — solve the captcha in the opened window"
            : "")
```

- [ ] **Step 2: Add Cancel and Retry handlers**

In `src/pages/Game.tsx`, add these two functions right after the existing `onExtract` function:

```tsx
  async function onCancel() {
    setStatus("Cancelling…");
    try {
      await cancelExtraction();
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    }
  }

  async function onRetryFailed() {
    const failed = failedSourceUrls(results);
    if (failed.length === 0) return;
    setBusy(true);
    setStatus(`Retrying ${failed.length} failed part(s)…`);
    try {
      await extractLinks(failed);
      setStatus("Retry complete.");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 3: Add the buttons to the controls row**

In `src/pages/Game.tsx`, replace the single Extract button inside the `part-list` block:

```tsx
          <Button onClick={onExtract} disabled={busy}>
            Extract selected
          </Button>
```

with:

```tsx
          <div className="controls-row">
            <Button onClick={onExtract} disabled={busy}>
              Extract selected
            </Button>
            {busy && (
              <Button variant="destructive" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {!busy && failedSourceUrls(results).length > 0 && (
              <Button variant="secondary" onClick={onRetryFailed}>
                Retry failed ({failedSourceUrls(results).length})
              </Button>
            )}
          </div>
```

- [ ] **Step 4: Add the `controls-row` class to `src/pages/Game.css`**

Append to `src/pages/Game.css`:

```css
.controls-row {
  @apply flex gap-2;
}
```

- [ ] **Step 5: Replace `src/pages/Game.test.tsx` with the updated mock + tests**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ExtractProgress } from "@/lib/api";

let progressCb: ((p: ExtractProgress) => void) | null = null;
const fetchPartsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchParts: (...args: unknown[]) => fetchPartsMock(...args),
  extractLinks: vi.fn(() => Promise.resolve([])),
  cancelExtraction: vi.fn(() => Promise.resolve()),
  onExtractProgress: vi.fn((cb: (p: ExtractProgress) => void) => {
    progressCb = cb;
    return Promise.resolve(() => {});
  }),
}));

import Game from "./Game";

beforeEach(() => {
  progressCb = null;
  fetchPartsMock.mockReset();
});

describe("Game page", () => {
  it("renders the URL input prefilled with the example game", () => {
    render(<Game />);
    expect(
      screen.getByPlaceholderText("https://fitgirl-repacks.site/<game>/")
    ).toHaveValue("https://fitgirl-repacks.site/grand-theft-auto-v/");
  });

  it("shows Retry failed once a part reports failed", async () => {
    fetchPartsMock.mockResolvedValue({
      valid: true,
      parts: ["https://fuckingfast.co/abc"],
    });
    render(<Game />);
    fireEvent.click(screen.getByRole("button", { name: /fetch links/i }));
    await screen.findByText("abc");

    await act(async () => {
      progressCb?.({
        index: 0,
        total: 1,
        sourceUrl: "https://fuckingfast.co/abc",
        status: "failed",
        directUrl: null,
      });
    });

    expect(
      await screen.findByRole("button", { name: /retry failed/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests + build**

```bash
cd /e/dev/fitgirl-downloader && npm test && npm run build
```

Expected: vitest PASS (3 Game cases incl. Retry, plus format/extract suites); `npm run build` clean.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Game.tsx src/pages/Game.css src/pages/Game.test.tsx
git commit -m "feat: Cancel and Retry-failed controls on the Game page"
```

---

### Task 6: End-to-end manual verification

No automated tests — live Turnstile and the WebView window are manual. Record results; do not commit code here.

- [ ] **Step 1: Run the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Auto-click (window hidden)**

Fetch a game, select 1–2 parts, Extract. Expected: the extractor window does NOT appear; parts resolve to `done` with `dl.fuckingfast.co/...` links in the main window — no manual clicking.

- [ ] **Step 3: Turnstile fallback**

If a part shows `needs_captcha`, the extractor window appears; solve the challenge once; extraction resumes and resolves automatically.

- [ ] **Step 4: Cancel**

Start an extraction over several parts and click **Cancel** mid-run. Expected: the run stops within ~1 s, status shows cancelled, the window hides, and links already resolved remain.

- [ ] **Step 5: Window recreate**

Start extraction and manually close the extractor window mid-part. Expected: it is recreated and the current part retried (up to 2 times) rather than hanging.

- [ ] **Step 6: Retry failed**

If any part is `failed`, click **Retry failed**. Expected: only the failed parts are re-extracted; already-done parts are untouched.

---

## Self-Review

**Spec coverage:**
- Auto-click + hidden/show-on-Turnstile → Tasks 2, 3 (inject loop + Phase 1/2 flow).
- Cancellation (`AtomicBool`, command, UI) → Tasks 3, 4, 5.
- Auto-recreate window → Task 3 (`WindowGone` → `ensure_window`, `MAX_RECREATES`).
- Timeout → failed → continue → Task 3 (`AUTO_TIMEOUT`/`MANUAL_TIMEOUT` → `Outcome::Failed`).
- Retry failed → Tasks 4 (`failedSourceUrls`), 5 (button).
- Dedup → Task 1 (source normalization) + Task 3 (`dedup_preserving_order` on results).
- Status set `processing|needs_captcha|done|failed|cancelled` → Task 3 (Rust) + Task 4 (`ExtractStatus`).

**Type consistency:** Rust `ExtractProgress` (`#[serde(rename_all = "camelCase")]`) → TS `ExtractProgress` (`sourceUrl`, `directUrl`) unchanged from Plan A. `extract_links(urls) -> Vec<String>` and `cancel_extraction()` match TS `extractLinks(urls): Promise<string[]>` and `cancelExtraction(): Promise<void>`. `failedSourceUrls(results)` consumes the same `ExtractProgress` map the `onExtractProgress` listener fills. Status strings emitted by Rust are exactly the members of the TS `ExtractStatus` union.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands state expected output. The browser-only inject and the window/Turnstile/cancel behaviors are explicitly routed to the Task 6 manual checklist because they cannot be unit-tested.
