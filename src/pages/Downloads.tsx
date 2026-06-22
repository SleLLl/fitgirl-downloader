import { Button } from "@/components/ui/button";
import {
  cancelDownload,
  formatBytes,
  formatSpeed,
  pauseDownload,
  resumeDownload,
} from "@/lib/download";
import { resumeAll } from "@/lib/settings";
import { useAppStore } from "@/store/useAppStore";
import "./Downloads.css";

export default function Downloads() {
  const items = useAppStore((s) => s.downloads);
  const rows = Object.values(items);
  const pausedCount = rows.filter(
    (d) => d.status === "paused" || d.status === "failed"
  ).length;

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2 className="downloads-title">Downloads ({rows.length})</h2>
        {pausedCount > 0 && (
          <Button variant="secondary" onClick={() => resumeAll()}>
            Resume all ({pausedCount})
          </Button>
        )}
      </div>
      {rows.length === 0 && <p className="downloads-empty">No downloads yet.</p>}
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
                <Button
                  variant="destructive"
                  onClick={() => cancelDownload(it.id)}
                >
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
