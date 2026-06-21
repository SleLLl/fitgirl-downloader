pub mod segment;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Semaphore;

use crate::downloader::segment::download_file;

/// Defaults (configurable later in B2). 3 files × 4 segments ≤ 12 connections.
const FILE_CONCURRENCY: usize = 3;
const SEGMENTS: u64 = 4;
const SEG_CONCURRENCY: usize = 4;

#[derive(Clone, Deserialize)]
pub struct DownloadRequest {
    pub url: String,
    pub filename: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub dir: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String,
    pub speed_bps: u64,
}

struct Shared {
    url: String,
    filename: String,
    dir: String,
    total: AtomicU64,
    downloaded: AtomicU64,
    speed: AtomicU64,
    status: Mutex<String>,
    /// The CURRENT attempt's stop flag. Each spawn installs a fresh one, so a
    /// resume can never un-stop a previous (still-draining) task.
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
            total_bytes: self.total.load(Ordering::Relaxed),
            downloaded_bytes: self.downloaded.load(Ordering::Relaxed),
            status: self.status.lock().unwrap().clone(),
            speed_bps: self.speed.load(Ordering::Relaxed),
        }
    }
}

pub struct DownloadManager {
    app: AppHandle,
    items: Arc<Mutex<HashMap<String, Arc<Shared>>>>,
    order: Arc<Mutex<Vec<String>>>,
    file_sem: Arc<Semaphore>,
    next_id: AtomicU64,
}

impl DownloadManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            items: Arc::new(Mutex::new(HashMap::new())),
            order: Arc::new(Mutex::new(Vec::new())),
            file_sem: Arc::new(Semaphore::new(FILE_CONCURRENCY)),
            next_id: AtomicU64::new(1),
        }
    }

    fn spawn_download(&self, id: String, shared: Arc<Shared>) {
        let app = self.app.clone();
        let file_sem = self.file_sem.clone();
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        // Install a fresh stop flag for THIS attempt; the old task keeps its own.
        let stop = Arc::new(AtomicBool::new(false));
        *shared.stop.lock().unwrap() = stop.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = match file_sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };
            if stop.load(Ordering::Relaxed) {
                return;
            }
            *shared.status.lock().unwrap() = "downloading".to_string();
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

            let client = reqwest::Client::new();
            let res = download_file(
                &client,
                &shared.url,
                &dest,
                SEGMENTS,
                SEG_CONCURRENCY,
                on_bytes,
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
    let mut started = Vec::new();
    for req in items {
        let id = format!("dl{}", manager.next_id.fetch_add(1, Ordering::Relaxed));
        let shared = Arc::new(Shared {
            url: req.url,
            filename: req.filename,
            dir: dir.clone(),
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

/// Signal the current attempt to stop. The running task observes the flag, stops,
/// and sets status to "paused" on exit — so "paused" reliably means "task gone".
#[tauri::command]
pub fn pause_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        shared.stop.lock().unwrap().store(true, Ordering::Relaxed);
    }
}

/// Re-spawn only when the previous attempt has finished (status paused/failed),
/// which guarantees no two tasks ever write the same temp files concurrently.
#[tauri::command]
pub fn resume_download(manager: State<'_, DownloadManager>, id: String) {
    let shared = manager.items.lock().unwrap().get(&id).cloned();
    if let Some(shared) = shared {
        let status = shared.status.lock().unwrap().clone();
        if status == "paused" || status == "failed" {
            manager.spawn_download(id, shared);
        }
    }
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        *shared.status.lock().unwrap() = "cancelled".to_string();
        shared.stop.lock().unwrap().store(true, Ordering::Relaxed);
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        for k in 0..(SEGMENTS as usize) {
            let _ = std::fs::remove_file(crate::downloader::segment::temp_path(&dest, k));
        }
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
