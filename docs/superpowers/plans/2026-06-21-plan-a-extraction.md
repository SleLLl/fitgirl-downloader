# Plan A — Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tauri v2 + React app shell plus the link-extraction core: validate a FitGirl URL, scrape its `fuckingfast.co` part links, drive a WebView to resolve each part's direct download URL (with manual-captcha fallback), and show the resolved links in a minimal UI.

**Architecture:** Rust backend owns scraping and the hidden extractor WebView window. The injected script captures `window.open("<direct>")` from the loaded page and signals Rust via `document.title` (sentinel prefix `FFLINK::`); Rust polls the title. The React UI calls Tauri commands and listens for `extract-progress` events.

**Tech Stack:** Tauri v2, Rust (`reqwest`, `scraper`, `tokio`, `url`, `serde`), React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui, vitest.

---

## File Structure (Plan A)

**Rust (`src-tauri/src/`):**
- `lib.rs` — app builder, module declarations, command registration (modified from scaffold).
- `scraper.rs` — `validate_fitgirl_url`, `parse_part_links`, `fetch_html` (pure + network split).
- `commands.rs` — `fetch_parts` Tauri command.
- `extractor/mod.rs` — extractor window, `parse_sentinel_title`, `extract_links` command, `ExtractProgress`.
- `extractor/inject.js` — page-side capture script.
- `tests/fixtures/game_page.html` — fixture for the parser test.

**React (`src/`):**
- `lib/api.ts` — typed wrappers for commands + the progress event.
- `lib/format.ts` — `filenameFromUrl` helper (+ `format.test.ts`).
- `pages/Game.tsx` — URL input, validation, part checklist, extract, results.
- `App.tsx` — renders `Game` (modified from scaffold).

---

### Task 1: Scaffold the Tauri v2 + React + TypeScript app

**Files:**
- Create: entire `src-tauri/` and `src/` scaffold via the official template.

- [ ] **Step 1: Create the app with the official template**

Run from `E:\dev\fitgirl-downloader` (the directory already exists and has a git repo + `docs/`):

```bash
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
```

If the CLI refuses because the directory is non-empty, scaffold in a temp dir and move files in:

```bash
npm create tauri-app@latest fitgirl-tmp -- --template react-ts --manager npm --yes
cp -r fitgirl-tmp/. .
rm -rf fitgirl-tmp
```

Expected: creates `package.json`, `index.html`, `vite.config.ts`, `src/` (React), and `src-tauri/` (Rust + `tauri.conf.json`).

- [ ] **Step 2: Install JS dependencies**

```bash
npm install
```

Expected: `node_modules/` populated, no errors.

- [ ] **Step 3: Verify the dev app builds and runs**

Run:

```bash
npm run tauri dev
```

Expected: a desktop window opens showing the default Tauri+React page. Close it (Ctrl+C in terminal). If WebView2 is missing, the installer prompt appears — install it, then re-run.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri v2 + React + TypeScript app"
```

---

### Task 2: Add Tailwind v4 + shadcn/ui

**Files:**
- Modify: `vite.config.ts`, `src/index.css` (or `src/App.css`), `tsconfig.json`, `package.json`.
- Create: `components.json`, `src/components/ui/*` (generated).

- [ ] **Step 1: Install Tailwind v4 and the Vite plugin**

```bash
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

- [ ] **Step 2: Wire the Tailwind Vite plugin**

Edit `vite.config.ts` so it includes the Tailwind plugin and a `@` path alias. Full file:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
```

- [ ] **Step 3: Import Tailwind in the global stylesheet**

Replace the contents of `src/index.css` with:

```css
@import "tailwindcss";
```

Ensure `src/main.tsx` imports it (`import "./index.css";`). Remove the default `src/App.css` import if present.

- [ ] **Step 4: Add the `@` alias to TypeScript**

In `tsconfig.json`, inside `compilerOptions`, add:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 5: Initialize shadcn/ui and add components**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input checkbox card
```

Expected: creates `components.json` and `src/components/ui/{button,input,checkbox,card}.tsx`.

- [ ] **Step 6: Verify styled UI renders**

Replace `src/App.tsx` with a minimal styled check:

```tsx
import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <Button>It works</Button>
    </main>
  );
}

export default App;
```

Run `npm run tauri dev`. Expected: a dark window with a styled "It works" button. Close it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind v4 and shadcn/ui"
```

---

### Task 3: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add crates to `[dependencies]`**

In `src-tauri/Cargo.toml`, ensure the `[dependencies]` section contains (keep the existing `tauri`, `serde`, `serde_json` lines from the scaffold; add the rest):

```toml
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "gzip", "cookies"] }
scraper = "0.20"
tokio = { version = "1", features = ["full"] }
url = "2"
```

- [ ] **Step 2: Verify it compiles**

Run:

```bash
cd src-tauri && cargo build && cd ..
```

Expected: compiles successfully (downloads crates on first run).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add reqwest, scraper, tokio, url deps"
```

---

### Task 4: Domain validator (TDD)

**Files:**
- Create: `src-tauri/src/scraper.rs`
- Modify: `src-tauri/src/lib.rs` (declare module)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/scraper.rs` with only the test and a stub:

```rust
use url::Url;

/// Returns true only when `input` is a URL on the official FitGirl domain.
pub fn validate_fitgirl_url(input: &str) -> bool {
    match Url::parse(input) {
        Ok(u) => matches!(
            u.host_str(),
            Some("fitgirl-repacks.site") | Some("www.fitgirl-repacks.site")
        ),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_official_domain() {
        assert!(validate_fitgirl_url(
            "https://fitgirl-repacks.site/grand-theft-auto-v/"
        ));
        assert!(validate_fitgirl_url(
            "https://www.fitgirl-repacks.site/some-game/"
        ));
    }

    #[test]
    fn rejects_phishing_and_garbage() {
        assert!(!validate_fitgirl_url("https://fitgirl-repacks.site.evil.com/x"));
        assert!(!validate_fitgirl_url("https://fitgirl-repacks.fake/x"));
        assert!(!validate_fitgirl_url("not a url"));
        assert!(!validate_fitgirl_url("ftp://fitgirl-repacks.site/x"));
    }
}
```

Then declare the module: add `mod scraper;` near the top of `src-tauri/src/lib.rs`.

- [ ] **Step 2: Run the test to verify it fails first (before the impl existed)**

Since Step 1 already includes the implementation, instead temporarily break it to confirm the test exercises behavior: change the match arm to `Some("nope")`, then run:

```bash
cd src-tauri && cargo test validate_fitgirl_url accepts_official_domain && cd ..
```

Expected: FAIL on `accepts_official_domain`.

- [ ] **Step 3: Restore the correct implementation**

Revert the match arm back to:

```rust
Some("fitgirl-repacks.site") | Some("www.fitgirl-repacks.site")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test && cd ..
```

Expected: PASS (`accepts_official_domain`, `rejects_phishing_and_garbage`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scraper.rs src-tauri/src/lib.rs
git commit -m "feat: validate official FitGirl domain"
```

---

### Task 5: Part-link parser (TDD with fixture)

**Files:**
- Create: `src-tauri/tests/fixtures/game_page.html`
- Modify: `src-tauri/src/scraper.rs`

- [ ] **Step 1: Create the HTML fixture**

Create `src-tauri/tests/fixtures/game_page.html`:

```html
<!doctype html>
<html><body>
  <article>
    <p>Download links:</p>
    <a href="https://fuckingfast.co/abc123#Game.part1.rar">Part 1</a>
    <a href="https://fuckingfast.co/def456#Game.part2.rar">Part 2</a>
    <a href="https://fuckingfast.co/abc123#Game.part1.rar">Part 1 dup</a>
    <a href="https://example.com/not-a-part">Unrelated</a>
    <a href="https://1fichier.com/?xyz">Other host</a>
  </article>
</body></html>
```

- [ ] **Step 2: Write the failing test**

Add to `src-tauri/src/scraper.rs` (inside the existing `#[cfg(test)] mod tests`):

```rust
    #[test]
    fn extracts_unique_fuckingfast_links_in_order() {
        let html = include_str!("../tests/fixtures/game_page.html");
        let links = parse_part_links(html);
        assert_eq!(
            links,
            vec![
                "https://fuckingfast.co/abc123#Game.part1.rar".to_string(),
                "https://fuckingfast.co/def456#Game.part2.rar".to_string(),
            ]
        );
    }
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd src-tauri && cargo test extracts_unique_fuckingfast_links_in_order && cd ..
```

Expected: FAIL — `parse_part_links` is not defined.

- [ ] **Step 4: Implement `parse_part_links`**

Add to `src-tauri/src/scraper.rs` (above the `#[cfg(test)]` block):

```rust
use scraper::{Html, Selector};

/// Collect unique `fuckingfast.co` href links from a game page, preserving order.
pub fn parse_part_links(html: &str) -> Vec<String> {
    let doc = Html::parse_document(html);
    let selector = Selector::parse("a[href]").expect("valid selector");
    let mut links: Vec<String> = Vec::new();
    for el in doc.select(&selector) {
        if let Some(href) = el.value().attr("href") {
            if href.contains("fuckingfast.co") {
                let owned = href.to_string();
                if !links.contains(&owned) {
                    links.push(owned);
                }
            }
        }
    }
    links
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src-tauri && cargo test && cd ..
```

Expected: PASS, including `extracts_unique_fuckingfast_links_in_order`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/scraper.rs src-tauri/tests/fixtures/game_page.html
git commit -m "feat: parse unique fuckingfast part links from game page"
```

---

### Task 6: `fetch_html` + `fetch_parts` command

**Files:**
- Modify: `src-tauri/src/scraper.rs` (add `fetch_html`)
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `fetch_html` to `scraper.rs`**

Append to `src-tauri/src/scraper.rs` (above the test module):

```rust
/// Fetch a page's HTML with a browser-like User-Agent.
pub async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<String, reqwest::Error> {
    client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .await?
        .text()
        .await
}
```

- [ ] **Step 2: Create the `fetch_parts` command**

Create `src-tauri/src/commands.rs`:

```rust
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
```

- [ ] **Step 3: Declare the module and register the command**

In `src-tauri/src/lib.rs`: add `mod commands;` near the other `mod` lines, and add `commands::fetch_parts` to the `tauri::generate_handler!` list. Example handler block:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::fetch_parts
        ])
```

- [ ] **Step 4: Verify it compiles**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: compiles with no errors (warnings about unused `FetchResult` fields are fine).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scraper.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: fetch_parts command (validate + fetch + parse)"
```

---

### Task 7: Sentinel-title parser (TDD)

**Files:**
- Create: `src-tauri/src/extractor/mod.rs`
- Modify: `src-tauri/src/lib.rs` (declare module)

- [ ] **Step 1: Write the failing test + stub module**

Create `src-tauri/src/extractor/mod.rs`:

```rust
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
```

Add `mod extractor;` near the other `mod` lines in `src-tauri/src/lib.rs`.

- [ ] **Step 2: Run the test to verify it passes for the right reason**

Temporarily change `strip_prefix(SENTINEL)` to `strip_prefix("WRONG::")`, then run:

```bash
cd src-tauri && cargo test parses_sentinel_title && cd ..
```

Expected: FAIL (returns `None`). This proves the test checks real behavior.

- [ ] **Step 3: Restore the correct prefix**

Change it back to `strip_prefix(SENTINEL)`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test && cd ..
```

Expected: PASS (`parses_sentinel_title`, `ignores_non_sentinel_titles`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/extractor/mod.rs src-tauri/src/lib.rs
git commit -m "feat: parse sentinel-title direct link signal"
```

---

### Task 8: The injected capture script

**Files:**
- Create: `src-tauri/src/extractor/inject.js`

- [ ] **Step 1: Write the capture script**

Create `src-tauri/src/extractor/inject.js`:

```js
// Injected into every fuckingfast.co page load in the extractor window.
// Finds the direct download URL and signals Rust by writing it into
// document.title with the FFLINK:: sentinel prefix.
(function () {
  var SENTINEL = "FFLINK::";
  var RE = /window\.open\("([^"]+)"\)/;

  function signal(url) {
    if (url) {
      document.title = SENTINEL + url;
    }
  }

  function scan() {
    try {
      var html = document.documentElement.outerHTML;
      var m = RE.exec(html);
      if (m && m[1]) {
        signal(m[1]);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Fallback: if the page actually calls window.open, capture it directly
  // and suppress the popup.
  var origOpen = window.open;
  window.open = function (url) {
    signal(url);
    return null;
  };

  if (!scan()) {
    var iv = setInterval(function () {
      if (scan()) clearInterval(iv);
    }, 300);
    setTimeout(function () {
      clearInterval(iv);
    }, 60000);
  }
})();
```

- [ ] **Step 2: Verify the file is referenced (compile check happens in Task 9)**

No build yet — Task 9 includes it via `include_str!`. Just confirm the file exists:

```bash
cat src-tauri/src/extractor/inject.js | head -n 3
```

Expected: prints the first lines of the script.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/extractor/inject.js
git commit -m "feat: page-side capture script for direct links"
```

---

### Task 9: Extractor window + `extract_links` command

**Files:**
- Modify: `src-tauri/src/extractor/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register command)

- [ ] **Step 1: Add the extractor implementation**

Insert the following into `src-tauri/src/extractor/mod.rs`, above the `#[cfg(test)]` block:

```rust
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

        let mut nav = win.clone();
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
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, extend the handler list to include `extractor::extract_links`:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::fetch_parts,
            extractor::extract_links
        ])
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: compiles. If `navigate` reports a signature mismatch on your Tauri patch version, bind the window as `let mut nav = win.clone();` (already done) — `navigate` takes `&mut self`.

- [ ] **Step 4: Run the existing unit tests still pass**

```bash
cd src-tauri && cargo test && cd ..
```

Expected: PASS (validator, parser, sentinel tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/extractor/mod.rs src-tauri/src/lib.rs
git commit -m "feat: extractor window driving and extract_links command"
```

---

### Task 10: React API wrappers + `filenameFromUrl` (TDD)

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`, `src/lib/api.ts`
- Modify: `package.json` (vitest), `vite.config.ts` is reused
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

Add a test script to `package.json` `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Create a vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filenameFromUrl } from "./format";

describe("filenameFromUrl", () => {
  it("uses the fragment after # when present", () => {
    expect(
      filenameFromUrl("https://fuckingfast.co/abc#Game.part1.rar")
    ).toBe("Game.part1.rar");
  });

  it("falls back to the last path segment", () => {
    expect(filenameFromUrl("https://fuckingfast.co/abc123")).toBe("abc123");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 5: Implement `format.ts`**

Create `src/lib/format.ts`:

```ts
/// Derive a human-readable filename from a fuckingfast URL, mirroring the
/// original Python logic: prefer the fragment after '#', else the last segment.
export function filenameFromUrl(url: string): string {
  if (url.includes("#")) {
    const frag = url.split("#").pop();
    if (frag) return frag;
  }
  const seg = url.split("/").pop();
  return seg ?? url;
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS (both cases).

- [ ] **Step 7: Create the typed Tauri API wrappers**

Create `src/lib/api.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type FetchResult = { valid: boolean; parts: string[] };

export type ExtractStatus = "processing" | "needs_captcha" | "done" | "failed";

export type ExtractProgress = {
  index: number;
  total: number;
  sourceUrl: string;
  status: ExtractStatus;
  directUrl: string | null;
};

export function fetchParts(url: string): Promise<FetchResult> {
  return invoke<FetchResult>("fetch_parts", { url });
}

export function extractLinks(urls: string[]): Promise<string[]> {
  return invoke<string[]>("extract_links", { urls });
}

export function onExtractProgress(
  cb: (p: ExtractProgress) => void
): Promise<UnlistenFn> {
  return listen<ExtractProgress>("extract-progress", (e) => cb(e.payload));
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib package.json vitest.config.ts package-lock.json
git commit -m "feat: typed Tauri API wrappers + filenameFromUrl helper"
```

---

### Task 11: Game page UI (URL input → checklist → extract → results)

**Files:**
- Create: `src/pages/Game.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the Game page**

Create `src/pages/Game.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  extractLinks,
  fetchParts,
  onExtractProgress,
  type ExtractProgress,
} from "@/lib/api";
import { filenameFromUrl } from "@/lib/format";

type Part = { url: string; checked: boolean };

export default function Game() {
  const [url, setUrl] = useState(
    "https://fitgirl-repacks.site/grand-theft-auto-v/"
  );
  const [status, setStatus] = useState("Waiting for input…");
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ExtractProgress>>({});

  useEffect(() => {
    const un = onExtractProgress((p) => {
      setResults((prev) => ({ ...prev, [p.sourceUrl]: p }));
      setStatus(
        `Extracting ${p.index + 1}/${p.total} — ${p.status}` +
          (p.status === "needs_captcha" ? " (solve the captcha in the window)" : "")
      );
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  async function onFetch() {
    setBusy(true);
    setParts([]);
    setResults({});
    setStatus("Fetching page…");
    try {
      const res = await fetchParts(url.trim());
      if (!res.valid) {
        setStatus("Not an official fitgirl-repacks.site URL.");
        return;
      }
      if (res.parts.length === 0) {
        setStatus("No fuckingfast links found on this page.");
        return;
      }
      setParts(res.parts.map((u) => ({ url: u, checked: true })));
      setStatus(`Found ${res.parts.length} parts. Uncheck unwanted, then Extract.`);
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onExtract() {
    const selected = parts.filter((p) => p.checked).map((p) => p.url);
    if (selected.length === 0) {
      setStatus("No parts selected.");
      return;
    }
    setBusy(true);
    setStatus("Starting extraction…");
    try {
      await extractLinks(selected);
      setStatus("Extraction complete.");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggle(idx: number) {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, checked: !p.checked } : p))
    );
  }

  const directLinks = parts
    .map((p) => results[p.url]?.directUrl)
    .filter((x): x is string => !!x);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-4">
      <h1 className="text-xl font-semibold">FitGirl Downloader — Extract</h1>

      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://fitgirl-repacks.site/<game>/"
          className="bg-zinc-900 border-zinc-700"
        />
        <Button onClick={onFetch} disabled={busy}>
          Fetch links
        </Button>
      </div>

      <p className="text-sm text-zinc-400 italic">{status}</p>

      {parts.length > 0 && (
        <div className="space-y-2 border border-zinc-800 rounded-md p-3">
          <div className="max-h-64 overflow-auto space-y-1">
            {parts.map((p, i) => {
              const r = results[p.url];
              return (
                <label key={p.url} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={p.checked} onCheckedChange={() => toggle(i)} />
                  <span className="flex-1">{filenameFromUrl(p.url)}</span>
                  {r && (
                    <span
                      className={
                        r.status === "done"
                          ? "text-green-400"
                          : r.status === "failed"
                          ? "text-red-400"
                          : "text-yellow-400"
                      }
                    >
                      {r.status}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <Button onClick={onExtract} disabled={busy}>
            Extract selected
          </Button>
        </div>
      )}

      {directLinks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">
            Direct links ({directLinks.length})
          </h2>
          <textarea
            readOnly
            className="w-full h-40 bg-zinc-900 border border-zinc-700 rounded-md p-2 text-xs font-mono"
            value={directLinks.join("\n")}
          />
          <Button
            onClick={() => navigator.clipboard.writeText(directLinks.join("\n"))}
          >
            Copy all
          </Button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Render it from `App.tsx`**

Replace `src/App.tsx` with:

```tsx
import Game from "@/pages/Game";

function App() {
  return <Game />;
}

export default App;
```

- [ ] **Step 3: Verify it compiles and renders**

```bash
npm run tauri dev
```

Expected: the window shows the URL field pre-filled, a "Fetch links" button, status text, and dark styling. Don't extract yet (that's Task 12). Close the window.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Game.tsx src/App.tsx
git commit -m "feat: Game page UI (fetch, checklist, extract, results)"
```

---

### Task 12: End-to-end manual verification (de-risks Risk #1)

This task has no automated tests — live Cloudflare Turnstile cannot be tested
automatically. Follow the checklist and record the outcome in the spec's Risk #1
note.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-fitgirl-downloader-design.md` (record finding)

- [ ] **Step 1: Run the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Fetch a real game's parts**

Paste a current `https://fitgirl-repacks.site/<game>/` URL with fuckingfast
mirrors, click **Fetch links**. Expected: the checklist fills with part filenames
and the status shows the count. (If FitGirl markup changed and zero parts appear,
fix the selector/host string in `src-tauri/src/scraper.rs::parse_part_links` and
re-run — that is the single isolated place to change.)

- [ ] **Step 3: Extract 1–2 parts**

Uncheck all but one or two parts, click **Extract selected**. Expected: status
cycles `processing → done`; the part shows `done` in green; a direct URL appears
in the "Direct links" box. If `needs_captcha` appears, the extractor window
becomes visible — solve the Turnstile once; extraction then continues and
resolves the link.

- [ ] **Step 4: Verify the direct link actually downloads (Risk #1)**

Copy a resolved direct URL and test a plain GET in a terminal:

```bash
curl -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o test_part.bin "<direct_url>"
```

Expected (the de-risking result): the file downloads with a real size. Record one
of two outcomes in the spec's "Risk #1" bullet:
- **Plain GET works** → Plan B's download engine needs no special cookies. Note this.
- **Plain GET fails (403/challenge)** → Plan B must reuse the extractor window's
  cookies + User-Agent. Note this so Plan B carries a shared cookie store.

- [ ] **Step 5: Record the finding and commit**

Edit the Risk #1 bullet in
`docs/superpowers/specs/2026-06-21-fitgirl-downloader-design.md` to state the
observed result (cookies needed: yes/no), then:

```bash
git add docs/superpowers/specs/2026-06-21-fitgirl-downloader-design.md
git commit -m "docs: record Risk #1 finding (direct-link cookie requirement)"
```

---

## Self-Review

**Spec coverage (Plan A scope):**
- WebView extractor (hidden window, inject, title poll, manual fallback) → Tasks 7, 8, 9.
- Game-page parser (collect fuckingfast links) → Task 5.
- Domain validator → Task 4.
- Minimal UI listing resolved links → Tasks 10, 11.
- Risk #1 de-risking → Task 12.
- (Download engine, homepage showcase → deferred to Plans B and C, per spec.)

**Type consistency:** `ExtractProgress` (Rust `#[serde(rename_all = "camelCase")]`)
matches the TS `ExtractProgress` (`sourceUrl`, `directUrl`). `fetch_parts` returns
`FetchResult { valid, parts }` matching TS `FetchResult`. `extract_links` takes
`urls: Vec<String>` / returns `Vec<String>`, matching `extractLinks(urls: string[]): Promise<string[]>`.
Sentinel constant `FFLINK::` is identical in `extractor/mod.rs` and `inject.js`.

**Placeholder scan:** No TBD/TODO/"handle errors" placeholders; every code step
contains complete code and every command states its expected output.
