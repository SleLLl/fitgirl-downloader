use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

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
    on_total: Arc<dyn Fn(u64) + Send + Sync>,
    stop: Arc<AtomicBool>,
) -> Result<u64, String> {
    let (total, range_ok) = probe_total(client, url).await?;
    on_total(total);
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
    let written = assemble(&temps, dest).map_err(|e| e.to_string())?;
    if total > 0 && written != total {
        return Err(format!("size mismatch: got {} expected {}", written, total));
    }
    for t in &temps {
        let _ = std::fs::remove_file(t);
    }
    Ok(written)
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
        let on_total: Arc<dyn Fn(u64) + Send + Sync> = Arc::new(|_| {});
        let written =
            download_file(&client, &url, &dest, 4, 4, on_bytes, on_total, stop)
                .await
                .unwrap();
        assert_eq!(written, 1000);
        assert_eq!(std::fs::read(&dest).unwrap(), blob);
        std::fs::remove_dir_all(&dir).ok();
    }
}
