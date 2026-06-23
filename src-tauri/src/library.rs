use std::path::Path;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::db::{Db, DownloadRow};

/// One game in the Library: a group of completed downloads that share a folder
/// and a base filename (the parts of a single repack).
#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGame {
    /// Pretty name shown in the UI (separators turned into spaces).
    pub name: String,
    pub dir: String,
    pub parts: u32,
    pub total_bytes: i64,
    /// A concrete file to reveal in the file manager.
    pub sample_path: String,
}

/// Strip the multipart/extension suffix to get a repack's base name.
/// `Cyberpunk.2077.part01.rar` -> `Cyberpunk.2077`; `Game.rar` -> `Game`.
fn base_name(filename: &str) -> &str {
    let lower = filename.to_ascii_lowercase();
    if let Some(idx) = lower.find(".part") {
        let after = &lower[idx + ".part".len()..];
        if after.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return &filename[..idx];
        }
    }
    match filename.rfind('.') {
        Some(i) => &filename[..i],
        None => filename,
    }
}

/// Turn a base name into a human-readable title.
fn pretty(base: &str) -> String {
    let s = base.replace(['.', '_'], " ");
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Group completed download rows into games by (dir, base name), preserving the
/// input order (newest first) of each group's first-seen file.
pub fn group(rows: Vec<DownloadRow>) -> Vec<LibraryGame> {
    let mut out: Vec<LibraryGame> = Vec::new();
    for r in rows {
        let base = base_name(&r.filename).to_string();
        let key = (r.dir.clone(), base.clone());
        if let Some(g) = out
            .iter_mut()
            .find(|g| g.dir == key.0 && g.name == pretty(&base))
        {
            g.parts += 1;
            g.total_bytes += r.total_bytes;
            continue;
        }
        let sample = Path::new(&r.dir)
            .join(&r.filename)
            .to_string_lossy()
            .to_string();
        out.push(LibraryGame {
            name: pretty(&base),
            dir: r.dir,
            parts: 1,
            total_bytes: r.total_bytes,
            sample_path: sample,
        });
    }
    out
}

#[tauri::command]
pub fn library_games(db: State<'_, Arc<Db>>) -> Vec<LibraryGame> {
    let rows = db.load_finished().unwrap_or_default();
    group(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(filename: &str, dir: &str, bytes: i64) -> DownloadRow {
        DownloadRow {
            id: filename.into(),
            url: "u".into(),
            filename: filename.into(),
            dir: dir.into(),
            total_bytes: bytes,
            status: "done".into(),
            created_at: 0,
        }
    }

    #[test]
    fn base_name_strips_part_and_extension() {
        assert_eq!(base_name("Cyberpunk.2077.part01.rar"), "Cyberpunk.2077");
        assert_eq!(base_name("Game.part12.rar"), "Game");
        assert_eq!(base_name("Single.iso"), "Single");
        assert_eq!(base_name("NoExtension"), "NoExtension");
        // ".part" not followed by a digit is not a multipart marker.
        assert_eq!(base_name("My.partner.game.rar"), "My.partner.game");
    }

    #[test]
    fn groups_parts_of_one_game() {
        let rows = vec![
            row("Cyberpunk.2077.part01.rar", "/dl", 100),
            row("Cyberpunk.2077.part02.rar", "/dl", 50),
            row("Doom.iso", "/dl", 200),
        ];
        let games = group(rows);
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].name, "Cyberpunk 2077");
        assert_eq!(games[0].parts, 2);
        assert_eq!(games[0].total_bytes, 150);
        assert_eq!(games[1].name, "Doom");
        assert_eq!(games[1].parts, 1);
    }

    #[test]
    fn same_base_in_different_dirs_stays_separate() {
        let rows = vec![
            row("Game.part1.rar", "/a", 1),
            row("Game.part1.rar", "/b", 1),
        ];
        assert_eq!(group(rows).len(), 2);
    }
}
