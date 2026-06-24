pub mod segment;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Semaphore;

use crate::db::{Db, DownloadRow};
use crate::downloader::segment::{download_file, temp_path};

/// Defaults when no persisted setting exists. 3 files × 4 segments ≤ 12 conns.
const DEFAULT_FILE_CONCURRENCY: usize = 3;
const DEFAULT_SEGMENTS: u64 = 4;
const SEG_CONCURRENCY: usize = 4;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub url: String,
    pub filename: String,
    /// Game metadata for the Library; empty for manual "Add by link" downloads.
    #[serde(default)]
    pub game_title: String,
    #[serde(default)]
    pub game_cover: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub dir: String,
    pub game_title: String,
    pub game_cover: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String,
    pub speed_bps: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub download_dir: Option<String>,
    pub file_concurrency: u32,
    pub segments: u32,
}

struct Shared {
    url: String,
    filename: String,
    dir: String,
    game_title: String,
    game_cover: String,
    /// Segment count fixed at creation (the `.partN` layout depends on it).
    segments: u64,
    total: AtomicU64,
    downloaded: AtomicU64,
    speed: AtomicU64,
    status: Mutex<String>,
    stop: Mutex<Arc<AtomicBool>>,
    last: Mutex<(u64, Instant)>,
}

impl Shared {
    fn snapshot(&self, id: &str) -> DownloadItem {
        DownloadItem {
            id: id.to_string(),
            url: self.url.clone(),
            filename: self.filename.clone(),
            dir: self.dir.clone(),
            game_title: self.game_title.clone(),
            game_cover: self.game_cover.clone(),
            total_bytes: self.total.load(Ordering::Relaxed),
            downloaded_bytes: self.downloaded.load(Ordering::Relaxed),
            status: self.status.lock().unwrap().clone(),
            speed_bps: self.speed.load(Ordering::Relaxed),
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Count how many consecutive `.part0,.part1,…` files already exist on disk.
fn detect_segments(dest: &Path) -> u64 {
    let mut k = 0u64;
    while temp_path(dest, k as usize).exists() {
        k += 1;
    }
    k
}

fn disk_downloaded(dest: &Path, segments: u64) -> u64 {
    (0..segments)
        .map(|k| {
            std::fs::metadata(temp_path(dest, k as usize))
                .map(|m| m.len())
                .unwrap_or(0)
        })
        .sum()
}

pub struct DownloadManager {
    app: AppHandle,
    db: Arc<Db>,
    items: Arc<Mutex<HashMap<String, Arc<Shared>>>>,
    order: Arc<Mutex<Vec<String>>>,
    file_sem: Arc<Semaphore>,
    next_id: AtomicU64,
}

impl DownloadManager {
    pub fn new(app: AppHandle, db: Arc<Db>) -> Self {
        let file_concurrency = db
            .get_setting("file_concurrency")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|n| *n >= 1)
            .unwrap_or(DEFAULT_FILE_CONCURRENCY);
        Self {
            app,
            db,
            items: Arc::new(Mutex::new(HashMap::new())),
            order: Arc::new(Mutex::new(Vec::new())),
            file_sem: Arc::new(Semaphore::new(file_concurrency)),
            next_id: AtomicU64::new(1),
        }
    }

    fn segments_setting(&self) -> u64 {
        self.db
            .get_setting("segments")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|n| *n >= 1)
            .unwrap_or(DEFAULT_SEGMENTS)
    }

    /// Repopulate the manager from persisted unfinished jobs at startup. A job
    /// that was `downloading` becomes `paused` (its task didn't survive); progress
    /// is recomputed from the on-disk part files. Jobs are NOT auto-resumed.
    pub fn restore_from_db(&self) {
        let rows = match self.db.load_unfinished() {
            Ok(r) => r,
            Err(_) => return,
        };
        let mut max_id = 0u64;
        for row in rows {
            if let Some(n) = row.id.strip_prefix("dl").and_then(|s| s.parse::<u64>().ok()) {
                max_id = max_id.max(n);
            }
            let dest = PathBuf::from(&row.dir).join(&row.filename);
            let (downloaded, status, segments) = if dest.exists() {
                let len = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
                (len, "done".to_string(), self.segments_setting())
            } else {
                let mut segs = detect_segments(&dest);
                if segs == 0 {
                    segs = self.segments_setting();
                }
                (disk_downloaded(&dest, segs), "paused".to_string(), segs)
            };
            let _ = self.db.set_status(&row.id, &status);
            let shared = Arc::new(Shared {
                url: row.url,
                filename: row.filename,
                dir: row.dir,
                game_title: row.game_title,
                game_cover: row.game_cover,
                segments,
                total: AtomicU64::new(row.total_bytes.max(0) as u64),
                downloaded: AtomicU64::new(downloaded),
                speed: AtomicU64::new(0),
                status: Mutex::new(status),
                stop: Mutex::new(Arc::new(AtomicBool::new(false))),
                last: Mutex::new((downloaded, Instant::now())),
            });
            let id = row.id.clone();
            self.items.lock().unwrap().insert(id.clone(), shared.clone());
            self.order.lock().unwrap().push(id.clone());
            let _ = self.app.emit("download-progress", shared.snapshot(&id));
        }
        if max_id + 1 > self.next_id.load(Ordering::Relaxed) {
            self.next_id.store(max_id + 1, Ordering::Relaxed);
        }
    }

    /// Re-queue a paused/failed download: mark it `queued` (so the UI shows it is
    /// waiting for a concurrency slot rather than still paused) and respawn it.
    /// When `file_concurrency` is already saturated the task blocks on the
    /// semaphore until a running download frees a slot.
    fn requeue(&self, id: String, shared: Arc<Shared>) {
        *shared.status.lock().unwrap() = "queued".to_string();
        let _ = self.db.set_status(&id, "queued");
        let _ = self.app.emit("download-progress", shared.snapshot(&id));
        self.spawn_download(id, shared);
    }

    fn spawn_download(&self, id: String, shared: Arc<Shared>) {
        let app = self.app.clone();
        let db = self.db.clone();
        let file_sem = self.file_sem.clone();
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        let segments = shared.segments;
        let stop = Arc::new(AtomicBool::new(false));
        *shared.stop.lock().unwrap() = stop.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = match file_sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };
            if stop.load(Ordering::Relaxed) {
                // Paused/cancelled before this queued task got a permit — record
                // the terminal state instead of silently leaving it "queued".
                let was_cancelled = *shared.status.lock().unwrap() == "cancelled";
                let final_status = if was_cancelled { "cancelled" } else { "paused" };
                *shared.status.lock().unwrap() = final_status.to_string();
                let _ = db.set_status(&id, final_status);
                let _ = app.emit("download-progress", shared.snapshot(&id));
                return;
            }
            *shared.status.lock().unwrap() = "downloading".to_string();
            let _ = db.set_status(&id, "downloading");
            let _ = app.emit("download-progress", shared.snapshot(&id));

            let s2 = shared.clone();
            let app2 = app.clone();
            let id2 = id.clone();
            let on_bytes: Arc<dyn Fn(u64) + Send + Sync> = Arc::new(move |n: u64| {
                let done = s2.downloaded.fetch_add(n, Ordering::Relaxed) + n;
                let mut last = s2.last.lock().unwrap();
                let dt = last.1.elapsed().as_millis();
                if dt >= 500 {
                    let speed = ((done - last.0) as u128 * 1000 / dt.max(1)) as u64;
                    s2.speed.store(speed, Ordering::Relaxed);
                    *last = (done, Instant::now());
                    let _ = app2.emit("download-progress", s2.snapshot(&id2));
                }
            });

            // Report the total size as soon as it's known (after the probe), so
            // the UI shows the denominator + percent during the download.
            let s4 = shared.clone();
            let app4 = app.clone();
            let id4 = id.clone();
            let db4 = db.clone();
            let on_total: Arc<dyn Fn(u64) + Send + Sync> = Arc::new(move |total: u64| {
                s4.total.store(total, Ordering::Relaxed);
                let _ = db4.set_total(&id4, total as i64);
                let _ = app4.emit("download-progress", s4.snapshot(&id4));
            });

            let client = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default();
            let res = download_file(
                &client,
                &shared.url,
                &dest,
                segments,
                SEG_CONCURRENCY,
                on_bytes,
                on_total,
                stop.clone(),
            )
            .await;

            let status = match res {
                Ok(total) => {
                    shared.total.store(total, Ordering::Relaxed);
                    shared.downloaded.store(total, Ordering::Relaxed);
                    "done"
                }
                Err(e) if e == "stopped" => {
                    let s = shared.status.lock().unwrap().clone();
                    if s == "cancelled" {
                        "cancelled"
                    } else {
                        "paused"
                    }
                }
                Err(_) => "failed",
            };
            shared.speed.store(0, Ordering::Relaxed);
            *shared.status.lock().unwrap() = status.to_string();
            let _ = db.set_status(&id, status);
            let _ = app.emit("download-progress", shared.snapshot(&id));
        });
    }
}

/// Queue and start downloads of `items` into `dir`.
#[tauri::command]
pub fn start_downloads(
    manager: State<'_, DownloadManager>,
    items: Vec<DownloadRequest>,
    dir: String,
) -> Vec<DownloadItem> {
    let segments = manager.segments_setting();
    let mut started = Vec::new();
    for req in items {
        let id = format!("dl{}", manager.next_id.fetch_add(1, Ordering::Relaxed));
        let created_at = now_secs();
        let _ = manager.db.upsert_job(&DownloadRow {
            id: id.clone(),
            url: req.url.clone(),
            filename: req.filename.clone(),
            dir: dir.clone(),
            total_bytes: 0,
            status: "queued".to_string(),
            created_at,
            game_title: req.game_title.clone(),
            game_cover: req.game_cover.clone(),
        });
        let shared = Arc::new(Shared {
            url: req.url,
            filename: req.filename,
            dir: dir.clone(),
            game_title: req.game_title,
            game_cover: req.game_cover,
            segments,
            total: AtomicU64::new(0),
            downloaded: AtomicU64::new(0),
            speed: AtomicU64::new(0),
            status: Mutex::new("queued".to_string()),
            stop: Mutex::new(Arc::new(AtomicBool::new(false))),
            last: Mutex::new((0, Instant::now())),
        });
        manager
            .items
            .lock()
            .unwrap()
            .insert(id.clone(), shared.clone());
        manager.order.lock().unwrap().push(id.clone());
        started.push(shared.snapshot(&id));
        manager.spawn_download(id, shared);
    }
    started
}

#[tauri::command]
pub fn pause_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        shared.stop.lock().unwrap().store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn resume_download(manager: State<'_, DownloadManager>, id: String) {
    let shared = manager.items.lock().unwrap().get(&id).cloned();
    if let Some(shared) = shared {
        let status = shared.status.lock().unwrap().clone();
        if status == "paused" || status == "failed" {
            manager.requeue(id, shared);
        }
    }
}

/// Resume every paused download.
#[tauri::command]
pub fn resume_all(manager: State<'_, DownloadManager>) {
    let pending: Vec<(String, Arc<Shared>)> = {
        let items = manager.items.lock().unwrap();
        manager
            .order
            .lock()
            .unwrap()
            .iter()
            .filter_map(|id| items.get(id).map(|s| (id.clone(), s.clone())))
            .filter(|(_, s)| {
                let st = s.status.lock().unwrap();
                *st == "paused" || *st == "failed"
            })
            .collect()
    };
    for (id, shared) in pending {
        manager.requeue(id, shared);
    }
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        *shared.status.lock().unwrap() = "cancelled".to_string();
        shared.stop.lock().unwrap().store(true, Ordering::Relaxed);
        shared.speed.store(0, Ordering::Relaxed);
        let _ = manager.db.set_status(&id, "cancelled");
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        for k in 0..(shared.segments as usize) {
            let _ = std::fs::remove_file(temp_path(&dest, k));
        }
        // A running task emits its own terminal event, but a paused download has
        // no task to do so — emit here so the UI always reflects the cancel.
        let _ = manager.app.emit("download-progress", shared.snapshot(&id));
    }
}

/// Stop (if running), drop temp files, and forget a download — from the manager
/// and the DB. The finished file (if any) is left on disk; only `.partN` temps
/// are removed.
fn forget(manager: &DownloadManager, id: &str) {
    if let Some(shared) = manager.items.lock().unwrap().get(id).cloned() {
        shared.stop.lock().unwrap().store(true, Ordering::Relaxed);
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        for k in 0..(shared.segments as usize) {
            let _ = std::fs::remove_file(temp_path(&dest, k));
        }
    }
    manager.items.lock().unwrap().remove(id);
    manager.order.lock().unwrap().retain(|x| x != id);
    let _ = manager.db.delete_job(id);
}

/// Remove a single download from the list (and DB).
#[tauri::command]
pub fn remove_download(manager: State<'_, DownloadManager>, id: String) {
    forget(&manager, &id);
}

/// Remove every finished/failed/cancelled download from the list (and DB).
#[tauri::command]
pub fn clear_finished(manager: State<'_, DownloadManager>) {
    let terminal: Vec<String> = {
        let items = manager.items.lock().unwrap();
        items
            .iter()
            .filter(|(_, s)| {
                matches!(
                    s.status.lock().unwrap().as_str(),
                    "done" | "failed" | "cancelled"
                )
            })
            .map(|(id, _)| id.clone())
            .collect()
    };
    for id in terminal {
        forget(&manager, &id);
    }
}

#[tauri::command]
pub fn list_downloads(manager: State<'_, DownloadManager>) -> Vec<DownloadItem> {
    let items = manager.items.lock().unwrap();
    manager
        .order
        .lock()
        .unwrap()
        .iter()
        .filter_map(|id| items.get(id).map(|s| s.snapshot(id)))
        .collect()
}

#[tauri::command]
pub fn get_settings(db: State<'_, Arc<Db>>) -> SettingsDto {
    SettingsDto {
        download_dir: db.get_setting("download_dir").ok().flatten(),
        file_concurrency: db
            .get_setting("file_concurrency")
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_FILE_CONCURRENCY as u32),
        segments: db
            .get_setting("segments")
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_SEGMENTS as u32),
    }
}

#[tauri::command]
pub fn set_setting(db: State<'_, Arc<Db>>, key: String, value: String) {
    let _ = db.set_setting(&key, &value);
}
