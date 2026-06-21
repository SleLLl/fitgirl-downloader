use std::sync::Mutex;

use rusqlite::Connection;

/// A persisted download job (progress is NOT stored — it is recomputed from the
/// on-disk `.partN` files on load).
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

/// Local SQLite store for download jobs and settings.
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
            rusqlite::params![
                r.id, r.url, r.filename, r.dir, r.total_bytes, r.status, r.created_at
            ],
        )?;
        Ok(())
    }

    pub fn set_status(&self, id: &str, status: &str) -> rusqlite::Result<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "UPDATE downloads SET status=?2 WHERE id=?1",
            rusqlite::params![id, status],
        )?;
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
                    id: row.get(0)?,
                    url: row.get(1)?,
                    filename: row.get(2)?,
                    dir: row.get(3)?,
                    total_bytes: row.get(4)?,
                    status: row.get(5)?,
                    created_at: row.get(6)?,
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
        DownloadRow {
            id: id.into(),
            url: "u".into(),
            filename: "f".into(),
            dir: "/d".into(),
            total_bytes: 10,
            status: status.into(),
            created_at: 1,
        }
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
