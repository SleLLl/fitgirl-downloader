import { Button } from "@/components/ui/button";
import {
  cancelDownload,
  formatBytes,
  formatSpeed,
  pauseDownload,
  resumeDownload,
  type DownloadItem,
} from "@/lib/download";

const CANCELABLE_STATUSES = ["downloading", "paused", "queued"];

export function DownloadRow({ item }: { item: DownloadItem }) {
  const percent =
    item.totalBytes > 0
      ? Math.floor((item.downloadedBytes / item.totalBytes) * 100)
      : 0;
  const isDownloading = item.status === "downloading";
  const isPaused = item.status === "paused";
  const isCancelable = CANCELABLE_STATUSES.includes(item.status);

  const handlePause = () => pauseDownload(item.id);
  const handleResume = () => resumeDownload(item.id);
  const handleCancel = () => cancelDownload(item.id);

  return (
    <div className="dl-row">
      <div className="dl-name">{item.filename}</div>
      <div className="dl-bar">
        <div className="dl-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="dl-meta">
        {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)} ·{" "}
        {formatSpeed(item.speedBps)} · {item.status}
      </div>
      <div className="dl-actions">
        {isDownloading && (
          <Button variant="secondary" onClick={handlePause}>
            Pause
          </Button>
        )}
        {isPaused && (
          <Button variant="secondary" onClick={handleResume}>
            Resume
          </Button>
        )}
        {isCancelable && (
          <Button variant="destructive" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
