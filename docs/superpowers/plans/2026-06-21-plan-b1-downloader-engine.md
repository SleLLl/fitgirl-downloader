# Plan B1 — Download Engine & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A segmented (multi-connection) download manager that takes the extractor's resolved direct links, downloads each file with HTTP Range into temp part files, verifies size, assembles the final file, and shows live progress with pause/resume/cancel — all in-session (durability is Plan B2).

**Architecture:** Pure range/assembly helpers are unit-tested; the networked single-file download (`download_file`) is integration-tested against a local tokio HTTP server; a `DownloadManager` runs files under a semaphore, tracks per-item state, and emits throttled `download-progress` events. React adds a Downloads dashboard, an Extract/Downloads tab switch, and a "Download all" button.

**Tech Stack:** Tauri v2, Rust (`reqwest` streaming, `tokio`, `futures-util`, `tauri-plugin-dialog`), React + TypeScript, vitest + Testing Library.

---

## File Structure (Plan B1)

- `src-tauri/src/downloader/segment.rs` — pure helpers (`split_ranges`, `segment_remaining`, `parse_content_range_total`, `temp_path`, `assemble`) + networked `probe_total`, `download_segment`, `download_file` (+ tests incl. a local HTTP server).
- `src-tauri/src/downloader/mod.rs` — `DownloadManager`, `DownloadItem`, `DownloadRequest`, the Tauri commands, progress events.
- `src-tauri/src/lib.rs` — register the dialog plugin, manage the manager, register commands.
- `src-tauri/Cargo.toml` — add `futures-util`, `tauri-plugin-dialog`, reqwest `stream` feature.
- `src-tauri/capabilities/default.json` — allow `dialog` permission.
- `src/lib/download.ts` (+ `download.test.ts`) — typed command wrappers + `buildRequests`, `formatBytes`, `formatSpeed`.
- `src/pages/Downloads.tsx` — the dashboard.
- `src/pages/Game.tsx` — "Download all" button.
- `src/App.tsx` — Extract/Downloads tab switch.

**Environment note (every task):** Windows. Run cargo from `src-tauri` with `export PATH="$HOME/.cargo/bin:$PATH"`. Do NOT run `npm run tauri dev` / `cargo run` (blocking GUI) — verify with `cargo test` / `cargo build` / `npm test` / `npm run build`. Git identity configured. Branch: `feat/plan-b1-downloader`.

---

### Task 1: Dependencies + dialog plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`
- Modify: `package.json` (JS dialog plugin, optional — not needed; we invoke via Rust command)

- [ ] **Step 1: Add Rust deps**

In `src-tauri/Cargo.toml` `[dependencies]`, change the `reqwest` line to add the `stream` feature and add two crates:

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "gzip", "cookies", "stream"] }
futures-util = "0.3"
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the dialog plugin in `lib.rs`**

In `src-tauri/src/lib.rs`, add the plugin to the builder (after the opener plugin line):

```rust
        .plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: Allow the dialog permission**

In `src-tauri/capabilities/default.json`, add `"dialog:default"` to the `"permissions"` array (keep existing entries).

- [ ] **Step 4: Verify build**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo build
```

Expected: compiles (downloads the new crates).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "chore: add reqwest stream, futures-util, dialog plugin"
```

---

### Task 2: Pure range/resume helpers (TDD)

**Files:**
- Create: `src-tauri/src/downloader/segment.rs`
- Modify: `src-tauri/src/lib.rs` (declare `mod downloader;` and inside it `pub mod segment;`)

- [ ] **Step 1: Create the module skeleton + failing tests**

Create `src-tauri/src/downloader/segment.rs`:

```rust
use std::path::{Path, PathBuf};

/// Browser-like User-Agent; direct links 200 with just this (no cookies).
pub const UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Split a file of `total` bytes into at most `segments` inclusive byte ranges.
/// The last range takes any remainder. Empty if total or segments is 0.
pub fn split_ranges(total: u64, segments: u64) -> Vec<(u64, u64)> {
    if total == 0 || segments == 0 {
        return vec![];
    }
    let segments = segments.min(total);
    let base = total / segments;
    let mut ranges = Vec::new();
    let mut start = 0u64;
    for i in 0..segments {
        let end = if i == segments - 1 {
            total - 1
        } else {
            start + base - 1
        };
        ranges.push((start, end));
        start = end + 1;
    }
    ranges
}

/// Remaining inclusive range to fetch for a segment `[start, end]` whose temp
/// file already holds `have` bytes. None when the segment is already complete.
pub fn segment_remaining(start: u64, end: u64, have: u64) -> Option<(u64, u64)> {
    let resume = start + have;
    if resume > end {
        None
    } else {
        Some((resume, end))
    }
}

/// Parse the total size out of a `Content-Range: bytes A-B/TOTAL` header value.
pub fn parse_content_range_total(header: &str) -> Option<u64> {
    header.rsplit('/').next()?.trim().parse::<u64>().ok()
}

/// Temp file path for segment `k` of `dest` (e.g. `game.rar.part0`).
pub fn temp_path(dest: &Path, k: usize) -> PathBuf {
    PathBuf::from(format!("{}.part{}", dest.to_string_lossy(), k))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_into_equal_ranges_with_remainder_last() {
        assert_eq!(split_ranges(10, 3), vec![(0, 2), (3, 5), (6, 9)]);
        assert_eq!(split_ranges(10, 1), vec![(0, 9)]);
        assert_eq!(split_ranges(2, 3), vec![(0, 0), (1, 1)]);
        assert_eq!(split_ranges(0, 4), Vec::<(u64, u64)>::new());
    }

    #[test]
    fn computes_segment_remaining() {
        assert_eq!(segment_remaining(0, 9, 0), Some((0, 9)));
        assert_eq!(segment_remaining(0, 9, 4), Some((4, 9)));
        assert_eq!(segment_remaining(0, 9, 10), None);
        assert_eq!(segment_remaining(3, 5, 3), None);
    }

    #[test]
    fn parses_content_range_total() {
        assert_eq!(parse_content_range_total("bytes 0-0/12345"), Some(12345));
        assert_eq!(
            parse_content_range_total("bytes 0-9419379/9419380"),
            Some(9419380)
        );
        assert_eq!(parse_content_range_total("bytes */*"), None);
    }

    #[test]
    fn builds_temp_path() {
        assert_eq!(
            temp_path(Path::new("/d/game.rar"), 2),
            PathBuf::from("/d/game.rar.part2")
        );
    }
}
```

Declare the module: in `src-tauri/src/lib.rs` add near the other `mod` lines:

```rust
mod downloader;
```

And create `src-tauri/src/downloader/mod.rs` with (for now) just:

```rust
pub mod segment;
```

- [ ] **Step 2: Run tests, confirm pass**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test segment::tests
```

Expected: 4 tests pass. (They are written to pass against the implementation above; to confirm they exercise behavior, temporarily change `total - 1` to `total` in `split_ranges` and re-run — `splits_into_equal_ranges_with_remainder_last` must FAIL — then revert.)

- [ ] **Step 3: Run full suite**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test
```

Expected: all pass (these 4 + the existing extractor/scraper tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/downloader/segment.rs src-tauri/src/downloader/mod.rs src-tauri/src/lib.rs
git commit -m "feat: pure segment range/resume/temp-path helpers"
```

---

### Task 3: `assemble` (TDD with a temp dir)

**Files:**
- Modify: `src-tauri/src/downloader/segment.rs`

- [ ] **Step 1: Write the failing test**

Add inside the `#[cfg(test)] mod tests` block in `segment.rs`:

```rust
    #[test]
    fn assembles_parts_in_order() {
        let dir = std::env::temp_dir().join(format!("ffdl_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p0 = dir.join("a.part0");
        let p1 = dir.join("a.part1");
        std::fs::write(&p0, b"hello ").unwrap();
        std::fs::write(&p1, b"world").unwrap();
        let dest = dir.join("a.txt");
        let n = assemble(&[p0, p1], &dest).unwrap();
        assert_eq!(n, 11);
        assert_eq!(std::fs::read(&dest).unwrap(), b"hello world");
        std::fs::remove_dir_all(&dir).ok();
    }
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test assembles_parts_in_order
```

Expected: FAIL — `assemble` not defined.

- [ ] **Step 3: Implement `assemble`**

Add to `segment.rs` (above the `#[cfg(test)]` block), and add `use std::io;` near the top imports:

```rust
/// Concatenate `parts` in order into `dest`, returning total bytes written.
pub fn assemble(parts: &[PathBuf], dest: &Path) -> io::Result<u64> {
    let mut out = std::fs::File::create(dest)?;
    let mut total = 0u64;
    for p in parts {
        let mut f = std::fs::File::open(p)?;
        total += io::copy(&mut f, &mut out)?;
    }
    use std::io::Write;
    out.flush()?;
    Ok(total)
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/downloader/segment.rs
git commit -m "feat: assemble part files into final file"
```

---

### Task 4: Networked download (`probe_total`, `download_segment`, `download_file`) + local-server integration test

**Files:**
- Modify: `src-tauri/src/downloader/segment.rs`

- [ ] **Step 1: Add the networked functions**

Add to `segment.rs` (above the test module). Add these imports at the top of the file:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
```

Then the functions:

```rust
/// Probe the URL with a 1-byte Range request. Returns (total_bytes, range_supported).
pub async fn probe_total(client: &reqwest::Client, url: &str) -> Result<(u64, bool), String> {
    let resp = client
        .get(url)
        .header("User-Agent", UA)
        .header("Range", "bytes=0-0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        if let Some(total) = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(parse_content_range_total)
        {
            return Ok((total, true));
        }
    }
    let len = resp.content_length().unwrap_or(0);
    Ok((len, false))
}

/// Download bytes `[start, end]` (resuming from the temp file's current size)
/// into `temp` (append). Calls `on_bytes` with each chunk length. Returns early
/// with Err("stopped") if `stop` is set.
pub async fn download_segment(
    client: &reqwest::Client,
    url: &str,
    start: u64,
    end: u64,
    temp: &Path,
    on_bytes: &(dyn Fn(u64) + Send + Sync),
    stop: &AtomicBool,
) -> Result<(), String> {
    let have = std::fs::metadata(temp).map(|m| m.len()).unwrap_or(0);
    let (rstart, rend) = match segment_remaining(start, end, have) {
        None => return Ok(()),
        Some(r) => r,
    };
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(temp)
        .await
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .header("User-Agent", UA)
        .header("Range", format!("bytes={}-{}", rstart, rend))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if stop.load(Ordering::Relaxed) {
            return Err("stopped".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        on_bytes(chunk.len() as u64);
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Download `url` into `dest` using up to `segments` concurrent Range segments
/// (`seg_concurrency` at once). Verifies the assembled size and cleans up temps.
pub async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    segments: u64,
    seg_concurrency: usize,
    on_bytes: Arc<dyn Fn(u64) + Send + Sync>,
    stop: Arc<AtomicBool>,
) -> Result<u64, String> {
    let (total, range_ok) = probe_total(client, url).await?;
    let ranges = if range_ok && total > 0 {
        split_ranges(total, segments)
    } else {
        vec![(0, total.saturating_sub(1))]
    };
    let temps: Vec<PathBuf> = (0..ranges.len()).map(|k| temp_path(dest, k)).collect();

    let sem = Arc::new(Semaphore::new(seg_concurrency.max(1)));
    let mut tasks = Vec::new();
    for (i, (s, e)) in ranges.iter().cloned().enumerate() {
        let client = client.clone();
        let url = url.to_string();
        let temp = temps[i].clone();
        let sem = sem.clone();
        let stop = stop.clone();
        let on_bytes = on_bytes.clone();
        tasks.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            download_segment(&client, &url, s, e, &temp, on_bytes.as_ref(), &stop).await
        }));
    }
    for t in tasks {
        t.await.map_err(|e| e.to_string())??;
    }
    if stop.load(Ordering::Relaxed) {
        return Err("stopped".into());
    }
    let written = assemble(&temps, dest)?;
    if total > 0 && written != total {
        return Err(format!("size mismatch: got {} expected {}", written, total));
    }
    for t in &temps {
        let _ = std::fs::remove_file(t);
    }
    Ok(written)
}
```

- [ ] **Step 2: Add the integration test (local HTTP server with Range)**

Add inside the `#[cfg(test)] mod tests` block in `segment.rs`:

```rust
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    async fn serve_blob(blob: Vec<u8>) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = match listener.accept().await {
                    Ok(x) => x,
                    Err(_) => break,
                };
                let blob = blob.clone();
                tokio::spawn(async move {
                    use tokio::io::{AsyncReadExt, AsyncWriteExt};
                    let mut buf = vec![0u8; 8192];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let total = blob.len() as u64;
                    let range = req
                        .lines()
                        .find(|l| l.to_ascii_lowercase().starts_with("range:"));
                    if let Some(r) = range {
                        let spec = r.split('=').nth(1).unwrap_or("").trim();
                        let mut it = spec.split('-');
                        let a: u64 = it.next().unwrap_or("0").trim().parse().unwrap_or(0);
                        let b: u64 = it
                            .next()
                            .and_then(|s| s.trim().parse().ok())
                            .unwrap_or(total - 1);
                        let a = a.min(total - 1);
                        let b = b.min(total - 1);
                        let slice = &blob[a as usize..=b as usize];
                        let header = format!(
                            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {}-{}/{}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n",
                            a, b, total, slice.len()
                        );
                        let _ = sock.write_all(header.as_bytes()).await;
                        let _ = sock.write_all(slice).await;
                    } else {
                        let header = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n",
                            total
                        );
                        let _ = sock.write_all(header.as_bytes()).await;
                        let _ = sock.write_all(&blob).await;
                    }
                });
            }
        });
        format!("http://{}/file", addr)
    }

    #[tokio::test]
    async fn downloads_and_assembles_via_range() {
        let blob: Vec<u8> = (0..1000u32).map(|i| (i % 256) as u8).collect();
        let url = serve_blob(blob.clone()).await;
        let dir = std::env::temp_dir().join(format!("ffdl_dl_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let dest = dir.join("blob.bin");
        let client = reqwest::Client::new();
        let stop = Arc::new(AtomicBool::new(false));
        let on_bytes: Arc<dyn Fn(u64) + Send + Sync> = Arc::new(|_| {});
        let written = download_file(&client, &url, &dest, 4, 4, on_bytes, stop)
            .await
            .unwrap();
        assert_eq!(written, 1000);
        assert_eq!(std::fs::read(&dest).unwrap(), blob);
        std::fs::remove_dir_all(&dir).ok();
    }
```

- [ ] **Step 3: Run the test**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test downloads_and_assembles_via_range -- --nocapture
```

Expected: PASS — the assembled file equals the served blob.

- [ ] **Step 4: Run full suite**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/downloader/segment.rs
git commit -m "feat: segmented file download with Range + size verification"
```

---

### Task 5: `DownloadManager` + commands + progress events

**Files:**
- Modify (replace): `src-tauri/src/downloader/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Replace `src-tauri/src/downloader/mod.rs` with the manager**

```rust
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
    pub status: String, // queued|downloading|paused|done|failed|cancelled
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
    stop: Arc<AtomicBool>,
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

    fn set_status(&self, shared: &Arc<Shared>, id: &str, status: &str) {
        *shared.status.lock().unwrap() = status.to_string();
        let _ = self.app.emit("download-progress", shared.snapshot(id));
    }

    fn spawn_download(&self, id: String, shared: Arc<Shared>) {
        let app = self.app.clone();
        let file_sem = self.file_sem.clone();
        let dest = PathBuf::from(&shared.dir).join(&shared.filename);
        tokio::spawn(async move {
            let _permit = match file_sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };
            if shared.stop.load(Ordering::Relaxed) {
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
                shared.stop.clone(),
            )
            .await;

            let status = match res {
                Ok(total) => {
                    shared.total.store(total, Ordering::Relaxed);
                    shared.downloaded.store(total, Ordering::Relaxed);
                    "done"
                }
                Err(e) if e == "stopped" => {
                    // paused or cancelled — leave status as the controller set it
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
            stop: Arc::new(AtomicBool::new(false)),
            last: Mutex::new((0, Instant::now())),
        });
        manager.items.lock().unwrap().insert(id.clone(), shared.clone());
        manager.order.lock().unwrap().push(id.clone());
        started.push(shared.snapshot(&id));
        manager.spawn_download(id, shared);
    }
    started
}

#[tauri::command]
pub fn pause_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        *shared.status.lock().unwrap() = "paused".to_string();
        shared.stop.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn resume_download(manager: State<'_, DownloadManager>, id: String) {
    let shared = manager.items.lock().unwrap().get(&id).cloned();
    if let Some(shared) = shared {
        shared.stop.store(false, Ordering::Relaxed);
        *shared.status.lock().unwrap() = "queued".to_string();
        manager.spawn_download(id, shared);
    }
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, id: String) {
    if let Some(shared) = manager.items.lock().unwrap().get(&id).cloned() {
        *shared.status.lock().unwrap() = "cancelled".to_string();
        shared.stop.store(true, Ordering::Relaxed);
        // best-effort temp cleanup
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
```

- [ ] **Step 2: Manage the manager + register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, inside `run()`, add a `.setup(...)` that creates and manages the manager, and add the five commands to `generate_handler!`. The builder chain becomes:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(extractor::ExtractorState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(downloader::DownloadManager::new(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fetch_parts,
            extractor::extract_links,
            extractor::cancel_extraction,
            downloader::start_downloads,
            downloader::pause_download,
            downloader::resume_download,
            downloader::cancel_download,
            downloader::list_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
```

- [ ] **Step 3: Build + test**

```bash
cd /e/dev/fitgirl-downloader/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo build && cargo test
```

Expected: compiles; existing tests still pass. (The manager is exercised by manual verification in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/downloader/mod.rs src-tauri/src/lib.rs
git commit -m "feat: DownloadManager, start/pause/resume/cancel/list commands, progress events"
```

---

### Task 6: Frontend download API + helpers (TDD)

**Files:**
- Create: `src/lib/download.ts`, `src/lib/download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/download.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRequests, formatBytes, formatSpeed } from "./download";
import type { ExtractProgress } from "./api";

const p = (sourceUrl: string, directUrl: string | null): ExtractProgress => ({
  index: 0,
  total: 1,
  sourceUrl,
  status: directUrl ? "done" : "failed",
  directUrl,
});

describe("buildRequests", () => {
  it("pairs each resolved directUrl with the source filename", () => {
    const results: Record<string, ExtractProgress> = {
      "https://fuckingfast.co/x#Game.part1.rar": p(
        "https://fuckingfast.co/x#Game.part1.rar",
        "https://dl.fuckingfast.co/dl/AAA"
      ),
      "https://fuckingfast.co/y#Game.part2.rar": p(
        "https://fuckingfast.co/y#Game.part2.rar",
        null
      ),
    };
    expect(buildRequests(results)).toEqual([
      { url: "https://dl.fuckingfast.co/dl/AAA", filename: "Game.part1.rar" },
    ]);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("formatSpeed", () => {
  it("appends /s", () => {
    expect(formatSpeed(1024)).toBe("1.0 KB/s");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd /e/dev/fitgirl-downloader && npm test
```

Expected: FAIL — cannot resolve `./download`.

- [ ] **Step 3: Create `src/lib/download.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ExtractProgress } from "./api";
import { filenameFromUrl } from "./format";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export type DownloadItem = {
  id: string;
  url: string;
  filename: string;
  dir: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  speedBps: number;
};

export type DownloadRequest = { url: string; filename: string };

/// Pair each resolved direct URL with its source filename (from the `#...`
/// fragment of the original fuckingfast link).
export function buildRequests(
  results: Record<string, ExtractProgress>
): DownloadRequest[] {
  return Object.values(results)
    .filter((p) => !!p.directUrl)
    .map((p) => ({
      url: p.directUrl as string,
      filename: filenameFromUrl(p.sourceUrl),
    }));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function pickDownloadDir(): Promise<string | null> {
  return open({ directory: true }).then((d) =>
    typeof d === "string" ? d : null
  );
}

export function startDownloads(
  items: DownloadRequest[],
  dir: string
): Promise<DownloadItem[]> {
  return invoke<DownloadItem[]>("start_downloads", { items, dir });
}

export function pauseDownload(id: string): Promise<void> {
  return invoke<void>("pause_download", { id });
}

export function resumeDownload(id: string): Promise<void> {
  return invoke<void>("resume_download", { id });
}

export function cancelDownload(id: string): Promise<void> {
  return invoke<void>("cancel_download", { id });
}

export function listDownloads(): Promise<DownloadItem[]> {
  return invoke<DownloadItem[]>("list_downloads");
}

export function onDownloadProgress(
  cb: (item: DownloadItem) => void
): Promise<UnlistenFn> {
  return listen<DownloadItem>("download-progress", (e) => cb(e.payload));
}
```

- [ ] **Step 4: Install the dialog JS plugin**

```bash
cd /e/dev/fitgirl-downloader && npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 5: Run tests + build**

```bash
cd /e/dev/fitgirl-downloader && npm test && npm run build
```

Expected: vitest PASS (buildRequests, formatBytes, formatSpeed + existing); `npm run build` clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/download.ts src/lib/download.test.ts package.json package-lock.json
git commit -m "feat: download API wrappers + buildRequests/formatBytes helpers"
```

---

### Task 7: Downloads dashboard + tab nav + "Download all"

**Files:**
- Create: `src/pages/Downloads.tsx`, `src/pages/Downloads.css`
- Modify: `src/App.tsx`, `src/pages/Game.tsx`
- Modify: `src/pages/Downloads.test.tsx` (create)

- [ ] **Step 1: Create `src/pages/Downloads.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelDownload,
  formatBytes,
  formatSpeed,
  listDownloads,
  onDownloadProgress,
  pauseDownload,
  resumeDownload,
  type DownloadItem,
} from "@/lib/download";
import "./Downloads.css";

export default function Downloads() {
  const [items, setItems] = useState<Record<string, DownloadItem>>({});

  useEffect(() => {
    listDownloads().then((list) =>
      setItems(Object.fromEntries(list.map((i) => [i.id, i])))
    );
    const un = onDownloadProgress((item) =>
      setItems((prev) => ({ ...prev, [item.id]: item }))
    );
    return () => {
      un.then((f) => f());
    };
  }, []);

  const rows = Object.values(items);

  return (
    <div className="downloads-page">
      <h2 className="downloads-title">Downloads ({rows.length})</h2>
      {rows.length === 0 && (
        <p className="downloads-empty">No downloads yet.</p>
      )}
      {rows.map((it) => {
        const pct =
          it.totalBytes > 0
            ? Math.floor((it.downloadedBytes / it.totalBytes) * 100)
            : 0;
        return (
          <div key={it.id} className="dl-row">
            <div className="dl-name">{it.filename}</div>
            <div className="dl-bar">
              <div className="dl-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="dl-meta">
              {formatBytes(it.downloadedBytes)} / {formatBytes(it.totalBytes)} ·{" "}
              {formatSpeed(it.speedBps)} · {it.status}
            </div>
            <div className="dl-actions">
              {it.status === "downloading" && (
                <Button variant="secondary" onClick={() => pauseDownload(it.id)}>
                  Pause
                </Button>
              )}
              {it.status === "paused" && (
                <Button variant="secondary" onClick={() => resumeDownload(it.id)}>
                  Resume
                </Button>
              )}
              {(it.status === "downloading" ||
                it.status === "paused" ||
                it.status === "queued") && (
                <Button variant="destructive" onClick={() => cancelDownload(it.id)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/Downloads.css`**

```css
.downloads-page {
  @apply space-y-3;
}
.downloads-title {
  @apply text-lg font-semibold;
}
.downloads-empty {
  @apply text-sm text-muted-foreground;
}
.dl-row {
  @apply border border-border rounded-md p-3 space-y-2;
}
.dl-name {
  @apply text-sm font-mono;
}
.dl-bar {
  @apply h-2 w-full bg-muted rounded;
}
.dl-bar-fill {
  @apply h-2 bg-green-500 rounded;
}
.dl-meta {
  @apply text-xs text-muted-foreground;
}
.dl-actions {
  @apply flex gap-2;
}
```

- [ ] **Step 3: Add the "Download all" button to `src/pages/Game.tsx`**

Add the import (with the other imports):

```tsx
import { buildRequests, pickDownloadDir, startDownloads } from "@/lib/download";
```

Add a handler after `onRetryFailed`:

```tsx
  async function onDownloadAll() {
    const reqs = buildRequests(results);
    if (reqs.length === 0) {
      setStatus("No resolved links to download yet.");
      return;
    }
    const dir = await pickDownloadDir();
    if (!dir) return;
    await startDownloads(reqs, dir);
    setStatus(`Queued ${reqs.length} download(s) into ${dir}.`);
  }
```

In the "Direct links" section JSX, next to the "Copy all" button, add:

```tsx
          <Button variant="secondary" onClick={onDownloadAll}>
            Download all
          </Button>
```

- [ ] **Step 4: Add the tab switch in `src/App.tsx`**

Replace `src/App.tsx` with:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Game from "@/pages/Game";
import Downloads from "@/pages/Downloads";

function App() {
  const [tab, setTab] = useState<"extract" | "downloads">("extract");
  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <nav className="flex gap-2 p-3 border-b border-border">
        <Button
          variant={tab === "extract" ? "default" : "secondary"}
          onClick={() => setTab("extract")}
        >
          Extract
        </Button>
        <Button
          variant={tab === "downloads" ? "default" : "secondary"}
          onClick={() => setTab("downloads")}
        >
          Downloads
        </Button>
      </nav>
      <div className="p-4">{tab === "extract" ? <Game /> : <Downloads />}</div>
    </main>
  );
}

export default App;
```

Note: `Game.tsx`'s root `<main className="game-page dark">` now renders inside this layout — change its outer element from `<main className="game-page dark">` to `<div className="game-page">` (remove the duplicate `dark`/`min-h-screen`, which `App` now owns). Keep all inner content.

- [ ] **Step 5: Create the component test `src/pages/Downloads.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/download", async () => {
  const actual = await vi.importActual<typeof import("@/lib/download")>(
    "@/lib/download"
  );
  return {
    ...actual,
    listDownloads: vi.fn(() => Promise.resolve([])),
    onDownloadProgress: vi.fn(() => Promise.resolve(() => {})),
  };
});

import Downloads from "./Downloads";

describe("Downloads page", () => {
  it("shows an empty state with no downloads", async () => {
    render(<Downloads />);
    expect(await screen.findByText(/no downloads yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests + build**

```bash
cd /e/dev/fitgirl-downloader && npm test && npm run build
```

Expected: vitest PASS (Downloads empty-state + existing Game/format/extract/download suites); `npm run build` clean. If `vi.importActual` of `@/lib/download` fails because it imports the Tauri dialog plugin at module load, change the mock to NOT spread `actual` and instead provide the needed exports explicitly (`listDownloads`, `onDownloadProgress`, plus `formatBytes`, `formatSpeed` re-implemented as identity-ish stubs) — note this in your report.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Downloads.tsx src/pages/Downloads.css src/pages/Downloads.test.tsx src/App.tsx src/pages/Game.tsx
git commit -m "feat: Downloads dashboard, Extract/Downloads tabs, Download all"
```

---

### Task 8: End-to-end manual verification

No automated tests — real network + filesystem + dialog. Record results; commit nothing.

- [ ] **Step 1: Run the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Download all**

On the Extract tab, fetch + extract a couple of parts, then click **Download all**. Pick a folder. Expected: switch to the Downloads tab — items appear, progress bars advance, speed shows, and finished files appear in the folder with correct sizes (compare to the source's listed size).

- [ ] **Step 3: Pause / resume**

Pause a file mid-download. Expected: it stops, `.partN` files remain in the folder. Resume — it continues from where it stopped (size keeps growing from the paused point, not from 0), and the final assembled file is byte-complete.

- [ ] **Step 4: Cancel**

Cancel a queued/downloading file. Expected: it stops and its `.partN` temp files are removed.

- [ ] **Step 5: Integrity**

Confirm a completed file's size equals the host's reported size and (optional) that 7-Zip can open the `.rar` part without a "corrupt" error.

---

## Self-Review

**Spec coverage:**
- Segmented Range download → Tasks 2 (`split_ranges`), 4 (`download_segment`/`download_file`).
- Size-only integrity → Task 4 (`written != total` check).
- Temp part files + assembly → Tasks 3 (`assemble`), 4.
- Resume from part files (in-session) → Tasks 2 (`segment_remaining`), 4 (append/Range), 5 (`resume_download` re-spawns).
- Queue + concurrency (3 files × 4 segments) → Task 5 (`FILE_CONCURRENCY`, `SEGMENTS`, `SEG_CONCURRENCY`, semaphores).
- Pause/resume/cancel → Task 5 commands.
- Progress events + speed → Task 5 (`on_bytes` throttled emit).
- Folder dialog (session) → Tasks 1, 6 (`pickDownloadDir`).
- "Download all" + copyable links retained → Task 7.
- Dashboard + tabs → Task 7.
- Single-stream fallback when no Range → Task 4 (`range_ok` branch).
- (SQLite durability, remembered folder, restart resume → deferred to B2, per spec Non-Goals.)

**Type consistency:** Rust `DownloadItem` `#[serde(rename_all = "camelCase")]` (`totalBytes`, `downloadedBytes`, `speedBps`) matches the TS `DownloadItem`. `DownloadRequest { url, filename }` matches TS and the `start_downloads(items, dir)` arg names. Command names (`start_downloads`, `pause_download`, `resume_download`, `cancel_download`, `list_downloads`) match the `invoke` strings. Event name `download-progress` identical both sides. `buildRequests` consumes the same `ExtractProgress` map (`directUrl`, `sourceUrl`) the extractor fills.

**Placeholder scan:** No TBD/TODO. Every code step has complete code; the one import correction (`SEG_DEFAULTS`) is called out explicitly with the exact replacement. Manager live behavior (pause/resume/cancel, real downloads) is routed to the Task 8 manual checklist because it needs real network + filesystem.
