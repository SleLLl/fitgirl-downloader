# Plan B2 — Durability Implementation Plan

> **Execution note:** Backend-coupled (db ↔ manager ↔ commands ↔ startup), so executed INLINE by the controller. Commit after each task; keep all tests green.

**Goal:** Persist download jobs + settings in a local SQLite DB (rusqlite), reload unfinished jobs on launch (progress recomputed from `.partN`), and remember the download folder + concurrency.

**Tech Stack:** Tauri v2, Rust (`rusqlite` bundled), React + TS.

---

## File Structure
- `src-tauri/src/db/mod.rs` — `Db` (Mutex<Connection>), `DownloadRow`, jobs + settings CRUD. Tested with a temp/`:memory:` DB.
- `src-tauri/src/downloader/mod.rs` — manager holds `Arc<Db>`; persists on start/status-change; `restore_from_db`; reads `segments`/`file_concurrency` from settings.
- `src-tauri/src/lib.rs` — `.setup`: open DB in `app_data_dir`, manage it, build manager with it, `restore_from_db`. Register `get_settings`/`set_setting`.
- `src/lib/settings.ts` (+ test) — `getSettings`/`setSetting`, `Settings` type.
- `src/store/useAppStore.ts` — add `settings` slice.
- `src/hooks/useAppEvents.ts` — load settings on mount → store.
- `src/hooks/useDownloads.ts` — persist folder on pick.
- `src/pages/Downloads.tsx` — Settings panel (folder + concurrency) + "Resume all".

---

### Task 1: `db` module (rusqlite) — TDD
- Cargo: add `rusqlite = { version = "0.32", features = ["bundled"] }`.
- `src-tauri/src/db/mod.rs`:

```rust
use std::sync::Mutex;
use rusqlite::Connection;

#[derive(Clone, Debug, PartialEq)]
pub struct DownloadRow {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub dir: String,
    pub total_bytes: i64,
    pub status: String,
    pub created_at: i64,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &str) -> rusqlite::Result<Db> {
        let conn = Connection::open(path)?;
        Self::init(&conn)?;
        Ok(Db { conn: Mutex::new(conn) })
    }

    pub fn open_in_memory() -> rusqlite::Result<Db> {
        let conn = Connection::open_in_memory()?;
        Self::init(&conn)?;
        Ok(Db { conn: Mutex::new(conn) })
    }

    fn init(conn: &Connection) -> rusqlite::Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS downloads(
               id TEXT PRIMARY KEY, url TEXT, filename TEXT, dir TEXT,
               total_bytes INTEGER, status TEXT, created_at INTEGER);
             CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);",
        )
    }

    pub fn upsert_job(&self, r: &DownloadRow) -> rusqlite::Result<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO downloads(id,url,filename,dir,total_bytes,status,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(id) DO UPDATE SET
               url=?2,filename=?3,dir=?4,total_bytes=?5,status=?6,created_at=?7",
            rusqlite::params![r.id, r.url, r.filename, r.dir, r.total_bytes, r.status, r.created_at],
        )?;
        Ok(())
    }

    pub fn set_status(&self, id: &str, status: &str) -> rusqlite::Result<()> {
        let c = self.conn.lock().unwrap();
        c.execute("UPDATE downloads SET status=?2 WHERE id=?1", rusqlite::params![id, status])?;
        Ok(())
    }

    pub fn load_unfinished(&self) -> rusqlite::Result<Vec<DownloadRow>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT id,url,filename,dir,total_bytes,status,created_at FROM downloads
             WHERE status IN ('queued','downloading','paused') ORDER BY created_at",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(DownloadRow {
                    id: row.get(0)?, url: row.get(1)?, filename: row.get(2)?, dir: row.get(3)?,
                    total_bytes: row.get(4)?, status: row.get(5)?, created_at: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        let c = self.conn.lock().unwrap();
        c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2)
             ON CONFLICT(key) DO UPDATE SET value=?2",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn row(id: &str, status: &str) -> DownloadRow {
        DownloadRow { id: id.into(), url: "u".into(), filename: "f".into(), dir: "/d".into(),
            total_bytes: 10, status: status.into(), created_at: 1 }
    }
    #[test]
    fn job_roundtrip_and_unfinished_filter() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_job(&row("a", "queued")).unwrap();
        db.upsert_job(&row("b", "done")).unwrap();
        db.set_status("a", "paused").unwrap();
        let un = db.load_unfinished().unwrap();
        assert_eq!(un.len(), 1);
        assert_eq!(un[0].id, "a");
        assert_eq!(un[0].status, "paused");
    }
    #[test]
    fn settings_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.get_setting("k").unwrap(), None);
        db.set_setting("k", "v").unwrap();
        db.set_setting("k", "v2").unwrap();
        assert_eq!(db.get_setting("k").unwrap(), Some("v2".to_string()));
    }
}
```
- Declare `mod db;` in lib.rs. `cargo test`. Commit `feat: rusqlite db module (jobs + settings)`.

### Task 2: Manager persistence + restore + settings-driven concurrency
- `DownloadManager::new(app, db: Arc<Db>)`; store `db`. Read `file_concurrency` from `db.get_setting("file_concurrency")` (default 3) for the semaphore. Add a `segments()` helper reading `db.get_setting("segments")` (default 4).
- `start_downloads`: after building each `Shared`, `db.upsert_job(&row(status="queued"))`. Pass `self.segments()` into the spawned task (or read in spawn) for `download_file`.
- In `spawn_download`'s status transitions, also `db.set_status(id, status)` (downloading/done/failed/paused/cancelled). Best-effort (`let _ =`).
- `restore_from_db(&self)`: for each `load_unfinished` row → build `Shared` with status `paused` (force, since a `downloading` task didn't survive); recompute `downloaded` from `.partN` sizes (sum of existing `temp_path(dest,k)` lens for k in 0..segments; if the final `dest` exists use its len + status `done` via `db.set_status`); insert into items/order; emit a `download-progress`. 
- Commit `feat: persist + restore download jobs; settings-driven concurrency`.

### Task 3: Settings commands + startup wiring
- `#[derive(Serialize)] SettingsDto { download_dir: Option<String>, file_concurrency: u32, segments: u32 }` (camelCase). `get_settings(db)`/`set_setting(db, key, value)` commands.
- `lib.rs .setup`: `let dir = app.path().app_data_dir()?; create_dir_all; let db = Arc::new(Db::open(dir.join("fitgirl-downloader.db"))?)` (fallback to `open_in_memory` on error); `app.manage(db.clone())`; build manager with `db`; `manager.restore_from_db()`; manage manager. Register `get_settings`,`set_setting`.
- `cargo build` + `cargo test`. Commit `feat: settings commands + DB startup/restore wiring`.

### Task 4: Frontend settings + Resume all
- `src/lib/settings.ts`: `Settings { downloadDir: string|null; fileConcurrency: number; segments: number }`; `getSettings()`/`setSetting(key,value)`; test the shape via a pure mapper if any (else minimal).
- Store: add `settings: Settings | null` + `setSettings`.
- `useAppEvents`: `getSettings().then(s => { store.setSettings(s); if (s.downloadDir) store.setDownloadDir(s.downloadDir); })`.
- `useDownloads.ensureDir`: after picking, `setSetting("download_dir", picked)`.
- `Downloads.tsx`: a Settings panel (folder text + two number inputs persisting via `setSetting` on change) and a "Resume all" button (resume every `paused` item). Adapt/extend tests minimally.
- `npm test` + `npm run build`. Commit `feat: settings panel, persisted folder, Resume all`.

### Task 5: Manual verification (user)
Start downloads → kill app mid-download → relaunch → dashboard shows them paused with correct partial sizes → Resume completes → folder pre-filled.

---

## Self-Review
- Spec coverage: persistence (T1/T2), restart restore (T2/T3), settings folder+concurrency (T2/T3/T4). ✓
- Types: `DownloadRow` Rust ↔ not exposed to TS (internal); `SettingsDto` camelCase ↔ TS `Settings`. ✓
- Placeholders: none; `restore_from_db` recompute detail specified (sum `.partN` lens / final file). Manual live test in T5.
