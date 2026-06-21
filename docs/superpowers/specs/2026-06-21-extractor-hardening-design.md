# Plan A.1 — Extractor Hardening & Automation — Design Spec

**Date:** 2026-06-21
**Status:** Approved
**Builds on:** Plan A (extraction), merged to `master`.

## Goal

Make the link extractor automatic and resilient: auto-click the DOWNLOAD button
so the user no longer clicks manually (window stays hidden, shown only when a
Turnstile challenge needs a human), let the user cancel a run, survive a closed
extractor window, never hang the whole run on one bad part, and retry only the
failed parts.

## Background (from Plan A)

The fuckingfast direct link only appears when the page's DOWNLOAD `<button>` is
clicked — its handler calls `window.open("https://dl.fuckingfast.co/dl/<token>")`
("first click opens ads, second starts the download"). The injected script hooks
`window.open` (suppressing the ad popup), filters for download-looking URLs, and
transports the captured URL to Rust by rewriting the window URL to
`<page>?fflink=<encoded>`; Rust polls `win.url()`. The `document.title` channel
does not work on Windows WebView2.

## Features

### 1. Auto-click (window hidden, shown only on Turnstile)

- **inject.js:** after load, find the DOWNLOAD control (a `<button>`/`<a>` whose
  text matches `/download/i`) and `.click()` it on an interval (~800 ms) until a
  link is captured. Repeated clicks are safe because `window.open` is suppressed.
  Stop the interval on capture or after a cap (~40 attempts).
- **Rust, per part:**
  1. Ensure the extractor window exists, **hidden**; navigate to the part URL.
  2. Poll `win.url()` for `?fflink=` for `AUTO_TIMEOUT` (12 s) while hidden.
  3. Captured → `done`; window stays hidden; next part.
  4. Not captured (likely Turnstile) → **show + focus** the window, emit
     `needs_captcha`, poll for `MANUAL_TIMEOUT` (120 s). After the user solves the
     challenge the auto-click fires and captures → hide window → `done`.
  5. Still nothing → `failed`; continue to the next part (window hidden).

### 2. Cancellation

- `ExtractorState { cancel: Arc<AtomicBool> }` registered via `app.manage()`.
- `extract_links` clears the flag at start and checks it inside every poll loop;
  when set, it emits status `cancelled`, hides the window, and returns what was
  resolved so far.
- `cancel_extraction` command sets the flag. UI shows a **Cancel** button while a
  run is in progress.

### 3. Auto-recreate window

- In the poll loop, if `win.url()` errors or `get_webview_window("extractor")`
  returns `None` (window closed/crashed), recreate the window and re-navigate the
  current part. Cap recreations per part (2); exceeding the cap marks the part
  `failed` and continues.

### 4. Timeout → failed → continue

- The per-part timeouts (auto 12 s, then manual 120 s if shown) end in `failed`
  for that part and proceed to the next — one bad part never hangs the run.

### 5. Retry failed parts

- The backend is stateless per call, so retry = call `extract_links` with the
  subset of source URLs whose latest status is `failed`.
- UI: a **Retry failed** button (shown when any part is `failed`) collects those
  source URLs and calls extract; new results merge into the existing map.

### 6. Dedup (robustness)

- Normalize source URLs when parsing (trim a trailing `/`) before the existing
  exact-dedup in `parse_part_links`.
- Defensively dedup the resolved direct URLs returned by `extract_links` so the
  same `dl.fuckingfast.co` link is never returned twice.

## Status values

`needs_click` is replaced by `needs_captcha` (window shown for the human). Full
set emitted by `extract-progress`: `processing` (optional, on navigate),
`needs_captcha`, `done`, `failed`, `cancelled`.

## Architecture & Files

- `src-tauri/src/extractor/mod.rs` — `ExtractorState` + cancel flag, the
  hidden/show per-part flow, window recreation, the `cancel_extraction` command,
  result dedup.
- `src-tauri/src/extractor/inject.js` — DOWNLOAD auto-click loop (plus existing
  capture/transport).
- `src-tauri/src/scraper.rs` — trailing-slash normalization in `parse_part_links`.
- `src-tauri/src/lib.rs` — `app.manage(ExtractorState…)` and register
  `cancel_extraction`.
- `src/lib/api.ts` — `cancelExtraction()` wrapper; `ExtractStatus` adds
  `needs_captcha` and `cancelled`; a `failedSourceUrls(results)` helper.
- `src/pages/Game.tsx` + `src/pages/Game.css` — Cancel button (during a run),
  Retry-failed button (when any failed), status rendering for the new states.

## Error Handling

- Window operations (`navigate`, `show`, `hide`, `url`) are best-effort; an error
  on `url()` triggers the recreate path (feature 3) rather than aborting.
- Cancellation is cooperative (checked between 200 ms polls), so it is not abrupt
  and leaves no half-open state.

## Testing Strategy

- **Rust units (no network/UI):** result dedup; trailing-slash source
  normalization in `parse_part_links`; the "collect failed" selection is a
  frontend concern (see below).
- **Frontend (vitest):** `failedSourceUrls(results)` returns exactly the
  `failed` source URLs; Game page shows a Cancel button while busy and a Retry
  button when a part is `failed` (Tauri API mocked).
- **Manual (live Turnstile):** auto-click resolves a part with no user click;
  Turnstile path shows the window and resumes after solving; Cancel stops a run;
  closing the extractor window mid-run recreates it.

## Non-Goals

- Auto-retry on failure (the user chose manual "retry failed" instead).
- Caching resolved links in SQLite (deferred; persistence lands in Plan B).
- Solving Turnstile automatically.
