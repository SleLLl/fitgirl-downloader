import { Button } from "@/components/ui/button";
import {
  cancelDownload,
  formatBytes,
  formatSpeed,
  pauseDownload,
  removeDownload,
  resumeDownload,
  revealDownload,
  type DownloadItem,
} from "@/lib/download";
import { useAppStore } from "@/store/useAppStore";

const PAUSABLE_STATUSES = ["downloading", "queued"];
const RESUMABLE_STATUSES = ["paused", "failed"];
const CANCELABLE_STATUSES = ["downloading", "queued", "paused"];
const REMOVABLE_STATUSES = ["done", "failed", "cancelled"];

function statusClass(status: string): string {
  if (status === "done") return "dl-status dl-status--done";
  if (status === "failed") return "dl-status dl-status--failed";
  if (status === "downloading") return "dl-status dl-status--active";
  if (status === "paused") return "dl-status dl-status--paused";
  return "dl-status dl-status--idle";
}

export function DownloadRow({ item }: { item: DownloadItem }) {
  const dropDownload = useAppStore((s) => s.dropDownload);
  const pruneEmptyJobs = useAppStore((s) => s.pruneEmptyJobs);
  const percent =
    item.totalBytes > 0
      ? Math.floor((item.downloadedBytes / item.totalBytes) * 100)
      : 0;
  const canPause = PAUSABLE_STATUSES.includes(item.status);
  const canResume = RESUMABLE_STATUSES.includes(item.status);
  const canCancel = CANCELABLE_STATUSES.includes(item.status);
  const canRemove = REMOVABLE_STATUSES.includes(item.status);
  const isDone = item.status === "done";

  const handlePause = () => pauseDownload(item.id);
  const handleResume = () => resumeDownload(item.id);
  const handleCancel = () => cancelDownload(item.id);
  const handleOpen = () => {
    void revealDownload(item);
  };
  const handleRemove = () => {
    void removeDownload(item.id);
    dropDownload(item.id);
    pruneEmptyJobs();
  };

  return (
    <div className="dl-row">
      <div className="dl-head">
        <div className="dl-name">{item.filename}</div>
        <span className={statusClass(item.status)}>{item.status}</span>
      </div>
      <div className="dl-bar">
        <div className="dl-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="dl-meta">
        {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)} ·{" "}
        {formatSpeed(item.speedBps)}
      </div>
      <div className="dl-actions">
        {canPause && (
          <Button variant="secondary" onClick={handlePause}>
            Pause
          </Button>
        )}
        {canResume && (
          <Button variant="secondary" onClick={handleResume}>
            Resume
          </Button>
        )}
        {canCancel && (
          <Button variant="destructive" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        {isDone && (
          <Button variant="secondary" onClick={handleOpen}>
            Open folder
          </Button>
        )}
        {canRemove && (
          <Button variant="secondary" onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
