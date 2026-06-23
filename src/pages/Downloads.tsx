import { Button } from "@/components/ui/button";
import { clearFinished, formatBytes, formatSpeed } from "@/lib/download";
import { resumeAll } from "@/lib/settings";
import { DownloadRow } from "@/components/DownloadRow";
import { useAppStore } from "@/store/useAppStore";
import "./Downloads.css";

const RESUMABLE_STATUSES = ["paused", "failed"];
const FINISHED_STATUSES = ["done", "failed", "cancelled"];
const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

export default function Downloads() {
  const downloads = useAppStore((s) => s.downloads);
  const items = Object.values(downloads);
  const resumableCount = items.filter((item) =>
    RESUMABLE_STATUSES.includes(item.status)
  ).length;
  const finishedCount = items.filter((item) =>
    FINISHED_STATUSES.includes(item.status)
  ).length;

  const activeItems = items.filter((item) =>
    ACTIVE_STATUSES.includes(item.status)
  );
  const totalSpeed = activeItems.reduce((sum, item) => sum + item.speedBps, 0);
  const totalBytes = activeItems.reduce((sum, item) => sum + item.totalBytes, 0);
  const downloadedBytes = activeItems.reduce(
    (sum, item) => sum + item.downloadedBytes,
    0
  );
  const overallPercent =
    totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;

  const dropFinished = useAppStore((s) => s.dropFinished);

  const handleResumeAll = () => resumeAll();
  const handleClearFinished = () => {
    void clearFinished();
    dropFinished();
  };

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2 className="downloads-title">Downloads ({items.length})</h2>
        <div className="downloads-actions">
          {resumableCount > 0 && (
            <Button variant="secondary" onClick={handleResumeAll}>
              Resume all ({resumableCount})
            </Button>
          )}
          {finishedCount > 0 && (
            <Button variant="secondary" onClick={handleClearFinished}>
              Clear finished ({finishedCount})
            </Button>
          )}
        </div>
      </div>
      {activeItems.length > 0 && (
        <div className="downloads-summary">
          ↓ {formatSpeed(totalSpeed)} · {formatBytes(downloadedBytes)} /{" "}
          {formatBytes(totalBytes)} ({overallPercent}%) · {activeItems.length}{" "}
          active
        </div>
      )}
      {items.length === 0 && (
        <p className="downloads-empty">No downloads yet.</p>
      )}
      {items.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </div>
  );
}
