# Plan B2 — Durability (Persistence, Restart Resume, Settings) — Design Spec

**Date:** 2026-06-21
**Status:** Approved (autonomous — user authorized; decisions documented here for morning review)
**Builds on:** B1 (download engine) + B1.5 (frontend store), merged to `master`.

## Goal

Make downloads and settings survive an app restart: persist each download job and
the user's settings (download folder, concurrency) to a local SQLite DB; on
launch, reload unfinished jobs into the manager (progress recomputed from the
on-disk `.partN` files) so the user can resume them; remember the download folder
and concurrency across restarts.

## Key decisions (autonomous — flag for review)

- **DB driver: `rusqlite` (bundled SQLite), NOT `sqlx`.** Rationale: the DB is
  purely local with a handful of trivial queries; `rusqlite` is synchronous and
  needs no compile-time `DATABASE_URL` (sqlx's `query!` macros require a real DB
  at build time, which complicates the build/CI). DB ops are tiny and run behind a
  `Mutex<Connection>`; no async DB needed. *(The earlier umbrella spec mentioned
  sqlx; this is a deliberate, documented deviation — easy to switch later if
  desired.)*
- **`downloaded_bytes` is NOT persisted** — it is recomputed from `.partN` file
  sizes on load (the on-disk files are the source of truth, exactly as in B1's
  in-session resume). The DB stores only job metadata + status.
- **On restart, jobs that were `downloading` become `paused`** (their task didn't
  survive). The app does NOT auto-resume on launch (avoid hammering the host); the
  user clicks Resume (or Resume all). `done`/`failed`/`cancelled` rows are kept as
  history and shown in the dashboard.
- **Concurrency settings:** `segments` (per-file) is read from settings on every
  `start_downloads` (takes effect immediately). `file_concurrency` is read once at
  manager construction (the file semaphore is fixed-size) — changes take effect
  after restart. Documented limitation; concurrency is rarely changed.

## Architecture

### Rust

- `src-tauri/src/db/mod.rs` — `Db` wrapping `Mutex<rusqlite::Connection>`:
  - `Db::open(path) -> Db` (creates tables if absent).
  - Jobs: `upsert_job(&DownloadRow)`, `set_status(id, status)`,
    `load_unfinished() -> Vec<DownloadRow>` (status in queued/downloading/paused),
    `load_all() -> Vec<DownloadRow>`.
  - Settings: `get_setting(key) -> Option<String>`, `set_setting(key, value)`.
  - `DownloadRow { id, url, filename, dir, total_bytes, status, created_at }`.
  - Schema (run on open):
    ```sql
    CREATE TABLE IF NOT EXISTS downloads(
      id TEXT PRIMARY KEY, url TEXT, filename TEXT, dir TEXT,
      total_bytes INTEGER, status TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    ```
- `downloader/mod.rs` — the `DownloadManager` gains an `Arc<Db>`:
  - `start_downloads` inserts a job row (status `queued`) per item and reads
    `segments`/`file_concurrency` defaults from settings.
  - The spawned task calls `db.set_status(id, …)` at each transition
    (downloading/done/failed/paused/cancelled) alongside the existing event emit.
  - `DownloadManager::new` reads `file_concurrency` from settings for the file
    semaphore.
  - New `restore_from_db()` — called at startup: `load_unfinished`, map each row to
    a `Shared` (status forced to `paused` if it was `downloading`), recompute
    `downloaded` from the `.partN` sizes (or the final file if it exists → `done`),
    insert into the items map + order, emit a progress event so the dashboard shows
    them.
- Commands: `get_settings() -> SettingsDto`, `set_setting(key, value)`; folder
  persistence happens via `set_setting("download_dir", dir)` from the frontend when
  a folder is chosen. `list_downloads` already returns the manager's items (now
  including restored ones).
- `lib.rs` `.setup`: resolve `app_data_dir()`, open the DB there
  (`fitgirl-downloader.db`), `app.manage(Arc<Db>)`, construct the manager with the
  DB, then `manager.restore_from_db()`.

### Frontend

- `src/lib/settings.ts` — `getSettings(): Promise<Settings>`,
  `setSetting(key, value): Promise<void>`; `Settings { downloadDir, fileConcurrency, segments }`.
- `src/hooks/useAppEvents.ts` — on mount also `getSettings()` → store
  (`downloadDir`, plus a new `settings` slice). `listDownloads()` already seeds
  the restored jobs.
- `useDownloads.ensureDir` — persists the chosen folder via `setSetting`.
- A minimal **Settings panel** on the Downloads page: shows the remembered folder
  and two number inputs (file concurrency, segments) that persist on change
  (segments applies next download; file-concurrency note: "after restart").
- A **Resume all** button on the Downloads page (resumes every `paused` item).

## Data Flow (restart)

App launches → `setup` opens DB + `restore_from_db()` repopulates the manager with
unfinished jobs (status `paused`, progress from disk) → frontend `useAppEvents`
calls `listDownloads()` (gets restored items) + `getSettings()` (folder/concurrency)
→ dashboard shows the paused downloads → user clicks Resume/Resume all → existing
B1 resume path continues each file from its `.partN` sizes.

## Error Handling

- DB open failure → log and continue with an in-memory fallback `Db` (downloads
  still work for the session, just not persisted). Never block app launch on DB.
- A restored job whose `dir`/`.partN` files are gone → recompute yields 0 bytes;
  resuming re-downloads from scratch (correct).
- `set_status` failures are best-effort (do not interrupt a download).

## Testing Strategy

- **Rust units (temp-file DB):** `Db::open` then `upsert_job`/`set_status`/
  `load_unfinished` round-trip; `get_setting`/`set_setting` round-trip; that
  `load_unfinished` excludes done/failed/cancelled. Use a temp-dir DB path (or
  `:memory:` for the pure cases).
- **Frontend (vitest):** `settings.ts` wrappers' shapes; store gains a `settings`
  slice (mutator test).
- **Manual:** start downloads, kill the app mid-download, relaunch → the
  dashboard shows them paused with the right partial sizes; Resume completes them;
  the download folder is pre-filled without re-asking.

## Non-Goals

- No cloud sync (Turso etc.) — local only.
- No migration framework — `CREATE TABLE IF NOT EXISTS` on open is enough for v1.
- No per-segment progress persistence — `.partN` sizes are the source of truth.
- No history management UI (clear finished, etc.) — later if wanted.
