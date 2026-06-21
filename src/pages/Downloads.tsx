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
