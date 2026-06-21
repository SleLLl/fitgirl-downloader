# FitGirl Downloader — Design Spec

**Date:** 2026-06-21
**Status:** Approved

## Goal

Desktop app (Tauri v2) that automates downloading FitGirl repacks hosted on the
`fuckingfast.co` file host: it scrapes a game page for all part links, bypasses
Cloudflare Turnstile to resolve each part's direct download URL, and downloads
all parts with a built-in segmented download manager — replacing the manual
"click 30 links one by one" workflow and tools like IDM / JDownloader2.

## Non-Goals (v1)

- Auto-updater and distribution mechanism — separate spec/plan later.
- Automatic extraction/installation of the FitGirl repack archives.
- Support for file hosts other than `fuckingfast.co`.
- Account/login features, cloud sync, telemetry.

## Tech Stack

- **Shell:** Tauri v2 (Windows-first, WebView2).
- **Backend:** Rust — `tokio` (async runtime), `reqwest` (HTTP, Range requests),
  `scraper` crate (HTML parsing), `sqlx` with the bundled SQLite driver
  (compile-time-checked queries, async; chosen over `rusqlite` to fit the async
  download engine), `md-5` (integrity), `serde`.
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui.
- **IPC:** Tauri commands (`invoke`) + events (`emit`/`listen`).

## Architecture

Three layers:

1. **Rust core (backend)** — owns all state and side effects: extraction engine,
   download engine, scraper/validator, SQLite persistence.
2. **WebView extractor** — a dedicated Tauri window (hidden by default) built on
   the system WebView2. Because it is a real browser engine, Cloudflare Turnstile
   treats it like a live user. If a challenge requires interaction, the window is
   shown so the user solves it once, then it returns to automatic operation.
3. **React UI** — repack showcase, URL input + part checklist, download dashboard.
   Talks to Rust via commands and events.

### Key mechanism: how the WebView returns a link to Rust

The `fuckingfast.co` page is third-party, so Tauri's IPC cannot be assumed inside
it. Two findings from implementation shaped the final mechanism:

- **The direct link is not in the static HTML.** It only materializes when the
  user clicks the page's DOWNLOAD button, whose handler calls
  `window.open("https://dl.fuckingfast.co/dl/<token>")`. So the extractor window
  is **always shown** and the user clicks DOWNLOAD (the "first click opens ads,
  second starts the download" page); there is no hidden auto-mode.
- **The `document.title` channel does not work.** WebView2 on Windows does not
  reflect a remote page's `document.title` changes via Tauri's `win.title()`, so
  the original sentinel-title approach silently failed.

Final mechanism (verified working):

- An **initialization script** hooks `window.open(url)` at runtime (suppressing
  the ad popup by returning `null`) and filters for download-looking URLs
  (file extension or the `fuckingfast` host) so the "open ads" click can't poison
  the channel.
- On capture, the script **rewrites its own URL** to `<page>?fflink=<encoded>`.
- The Rust side **polls `win.url()`** (~200 ms) and reads the `fflink` query
  param — navigations are always reflected in the webview URL, unlike the title.

*Alternatives considered:* (1) the `document.title` sentinel — rejected, doesn't
work on Windows WebView2; (2) a local HTTP endpoint POST — rejected as more
complex than the URL channel.

## Modules & File Structure

### Rust (`src-tauri/src/`)

- `extractor/mod.rs` — owns the extractor WebView window: navigates per part,
  injects the capture script, polls the title, manages the per-part queue, emits
  progress/fallback events.
- `extractor/inject.js` — the injected capture script (hook `window.open`, set
  `document.title`).
- `downloader/mod.rs` — segmented download engine: HTTP Range splitting + tokio
  tasks, queue with configurable concurrency, pause/resume, resume-across-restart
  via `.part` files, integrity check (size + MD5).
- `downloader/segment.rs` — range math and per-segment writer.
- `scraper/mod.rs` — parse the FitGirl homepage (showcase), parse a game page
  (collect `fuckingfast.co` links), and validate the official domain.
- `db/mod.rs` — SQLite schema + queries: jobs, parts, statuses, history.
- `commands.rs` — thin Tauri commands wrapping the modules.
- `lib.rs` / `main.rs` — app setup, state, plugin registration.

### React (`src/`)

- `pages/Home.tsx` — top-repacks showcase grid (cover, title, click to load).
- `pages/Game.tsx` — URL input + domain validation, part checklist, "Extract".
- `pages/Downloads.tsx` — download dashboard (per-part progress, pause/resume).
- `components/ui/*` — shadcn/ui components.
- `lib/api.ts` — typed wrappers around Tauri commands + event subscriptions.

## Data Flow (happy path)

1. **Home:** Rust scrapes `fitgirl-repacks.site` → `[{title, coverUrl, pageUrl}]`
   → grid.
2. **Select/paste:** user picks a game or pastes a URL → validator confirms the
   official domain → Rust parses the page → list of `fuckingfast.co` parts.
3. **Checklist:** user unchecks unwanted parts → "Extract" → extractor runs the
   parts through the WebView one by one → emits direct URLs with progress.
4. **Download:** direct URLs enter the download queue → segmented download with
   progress → integrity check → ready for the user's FitGirl unpacking.

## Persistence (SQLite via sqlx)

- `jobs(id, game_title, page_url, created_at, status)`
- `parts(id, job_id, source_url, direct_url, filename, total_bytes,
  downloaded_bytes, md5_expected, status)`
- `settings(key, value)` — e.g. download concurrency, segment count, download dir.

State is persisted so the queue and partially-downloaded parts survive an app
restart (resume from where it stopped).

## Error Handling & Risks

1. **Direct link needs Cloudflare cookie/UA (Risk #1):** the download engine
   reuses cookies + User-Agent from the WebView session. Verified against the
   first extracted part before building further.
2. **Host doesn't support Range:** fall back to single-stream download for that
   file (detected via `Accept-Ranges` / a probe request).
3. **FitGirl / fuckingfast markup changes:** parsers are isolated; selectors and
   regexes live in one place per parser, easy to fix.
4. **Turnstile not solved automatically:** fallback to showing the window for
   manual solve.

## Plan A hardening follow-ups (deferred to Plan B)

These were surfaced by the Plan A code review and are non-blocking for the
extraction milestone, but should be addressed before Plan B consumes the
resolved links programmatically:

- **Stale-title race:** the extractor currently de-dups by comparing each
  resolved direct URL against the previous one (`exclude`). Replace with a
  per-navigation nonce baked into the sentinel (`FFLINK::<seq>::<url>`) so the
  title channel is race-free even when consecutive parts resolve to equal URLs.
- **Shared HTTP client / cookies:** `fetch_parts` builds a fresh stateless
  `reqwest::Client` per call. Plan B's download engine needs a shared client
  with the WebView's cookie store + User-Agent (this is Risk #1).

## Testing Strategy

- **Rust unit tests (no network):** page parsers against saved HTML fixtures;
  range/segment math; resume logic; domain validator.
- **Download engine:** tested against a local HTTP server that supports Range
  (and a mode that does not).
- **Extractor:** hard to test automatically (live Turnstile) → manual checklist
  plus a mock page that calls `window.open(...)` to verify the title channel.

## Implementation Plan Decomposition

v1 is large; it will be built as three implementation plans, each producing
working, testable software on its own:

- **Plan A — Extraction:** WebView extractor + game-page parser + domain
  validator + minimal UI listing resolved links. (Built first; de-risks Risk #1.)
- **Plan B — Downloader:** segmentation, queue, pause/resume, integrity check +
  download dashboard.
- **Plan C — Showcase:** homepage scraper + top-repacks grid.
- **Later (separate spec):** auto-updater + distribution.
