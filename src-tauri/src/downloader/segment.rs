use std::io;
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
}
