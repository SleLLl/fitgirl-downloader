# Plan B1 — Download Engine & Dashboard — Design Spec

**Date:** 2026-06-21
**Status:** Approved
**Builds on:** Plan A / A.1 (extraction), merged to `master`.
**Followed by:** Plan B2 — Durability (SQLite job records + resume across app restart + remembered settings).

## Goal

A built-in segmented download manager: take the extractor's resolved direct
links, download each file with multiple parallel connections (HTTP Range),
verify size, and show live progress with pause / resume / cancel — replacing
IDM/JDownloader for FitGirl repack parts. State lives in memory this phase
(durability across app restart is Plan B2); resume *within* a session works via
on-disk part files.

## Resolved facts (from Risk #1 probe)

A plain GET to `dl.fuckingfast.co/dl/<token>` with only a browser `User-Agent`
(no cookies) returns `200 OK`. A `bytes=0-15` request returns `206 Partial
Content` with `Content-Range: bytes 0-<n>/<total>`. So: no cookie/session sharing
is needed, the total size comes from `Content-Range`, and segmented downloads
work.

## Decisions

- **Integrity:** size only — a file is complete when bytes on disk == total from
  `Content-Range`. (FitGirl's installer verifies the repack MD5 at unpack time.)
- **Trigger:** a "Download all" button on the extract results (+ a per-part
  button). The copyable "Direct links" list stays — link-only users are unaffected.
- **Download folder:** chosen via a native folder dialog, held for the session.
  (Persisting it as a default is Plan B2.) Defaults to nothing until picked.
- **Concurrency (configurable; these are the defaults):** 3 files in parallel,
  4 segments per file → ≤ 12 connections.
- **Filenames:** the frontend pairs each resolved `directUrl` with its source
  filename via `filenameFromUrl(sourceUrl)` (the `#...partNNN.rar` fragment) — no
  extractor change needed.

## Architecture

Rust owns the download engine and emits progress events; React renders the
dashboard and triggers downloads.

### Rust (`src-tauri/src/`)

- `downloader/segment.rs` — download ONE file:
  - Probe with a `Range: bytes=0-0` request to read the total size from
    `Content-Range` (and detect Range support).
  - If Range supported: split `0..total` into N equal segments; download each
    segment concurrently into its own temp file `<dest>.part{k}`. A segment's
    progress is its temp file's current size, so resume continues from
    `Range: bytes=<segStart + tempLen>-<segEnd>`.
  - If Range NOT supported: single stream into `<dest>.part0` (still resumable
    via `Range: bytes=<len>-`, falling back to full restart if the host ignores
    it).
  - On all-segments-complete: verify summed size == total, concatenate
    `part0..partN-1` into `<dest>`, delete temps.
  - Per-segment retry (N times) on a broken connection before failing the file.
- `downloader/mod.rs` — the manager:
  - An in-memory map of `DownloadItem { id, url, filename, dir, total_bytes,
    downloaded_bytes, status, speed_bps }`; status ∈
    `queued | downloading | paused | done | failed | cancelled`.
  - A file-level `tokio::sync::Semaphore` (default 3) gates parallel files; a
    per-file segment semaphore (default 4) gates connections within a file.
  - Pause cancels the file's segment tasks but keeps temp files; resume
    re-spawns them from temp sizes; cancel deletes temp files.
  - Computes speed (Δbytes/Δt) and emits `download-progress` (~every 500 ms).
- `commands.rs` (extend) / `downloader` commands:
  - `start_downloads(items: Vec<DownloadRequest>, dir: String)` where
    `DownloadRequest { url, filename }`.
  - `pause_download(id)`, `resume_download(id)`, `cancel_download(id)`.
  - `list_downloads() -> Vec<DownloadItem>`.
- Folder picking uses `tauri-plugin-dialog` (added this phase).

### React (`src/`)

- `pages/Downloads.tsx` — dashboard: per-item row (filename, progress bar,
  downloaded/total, speed, status, pause/resume/cancel) + an overall progress
  line.
- A minimal tab switch between **Extract** (the existing Game page) and
  **Downloads** — `App.tsx` gains a tiny nav (no router library).
- `pages/Game.tsx` — a "Download all" button on the results that: opens the
  folder dialog if no folder chosen yet, then calls `startDownloads` with
  `{ url, filename }` pairs built from `results`.
- `lib/download.ts` — typed wrappers (`startDownloads`, `pauseDownload`,
  `resumeDownload`, `cancelDownload`, `onDownloadProgress`, `pickDownloadDir`)
  and a `formatBytes` / `formatSpeed` helper.

## Data Types (Rust ↔ TS, camelCase over the wire)

- `DownloadRequest { url: String, filename: String }`.
- `DownloadItem { id, url, filename, dir, totalBytes, downloadedBytes, status,
  speedBps }` — emitted by `download-progress` and returned by `list_downloads`.

## Error Handling

- Host returns no Range for a file → single-stream fallback (logged in the item;
  still shows progress).
- Segment connection drops → retry that segment up to a fixed count, then mark
  the file `failed` without aborting the rest of the queue.
- Size mismatch after assembly → file `failed`; temp files are NOT deleted (kept
  for manual inspection).
- Folder not writable / disk error → file `failed` with the error surfaced in the
  item.

## Testing Strategy

- **Rust units (no real network):** segment range-math (split `total` into N
  ranges, last segment takes the remainder); resume-offset computation from temp
  file sizes; final-size verification. A small **local `tokio` HTTP server**
  fixture that serves a known blob with Range support (and a mode that ignores
  Range) drives an end-to-end engine test: download → assembled file equals the
  blob; resume after a simulated partial.
- **Frontend (vitest):** building `{ url, filename }` pairs from `results`;
  `formatBytes`/`formatSpeed`.
- **Manual:** "Download all" a real repack into a chosen folder; pause/resume a
  file mid-download; cancel; confirm assembled files are byte-complete.

## Non-Goals (this phase — deferred to B2)

- SQLite persistence of jobs; resume across an app restart.
- Remembering the download folder / concurrency settings across restarts.
- MD5/hash verification; bandwidth throttling; scheduling.
