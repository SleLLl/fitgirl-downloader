import { Button } from "@/components/ui/button";
import { resumeAll } from "@/lib/settings";
import { DownloadRow } from "@/components/DownloadRow";
import { useAppStore } from "@/store/useAppStore";
import "./Downloads.css";

const RESUMABLE_STATUSES = ["paused", "failed"];

export default function Downloads() {
  const downloads = useAppStore((s) => s.downloads);
  const items = Object.values(downloads);
  const resumableCount = items.filter((item) =>
    RESUMABLE_STATUSES.includes(item.status)
  ).length;

  const handleResumeAll = () => resumeAll();

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2 className="downloads-title">Downloads ({items.length})</h2>
        {resumableCount > 0 && (
          <Button variant="secondary" onClick={handleResumeAll}>
            Resume all ({resumableCount})
          </Button>
        )}
      </div>
      {items.length === 0 && (
        <p className="downloads-empty">No downloads yet.</p>
      )}
      {items.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </div>
  );
}
