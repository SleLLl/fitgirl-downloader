import { Button } from "@/components/ui/button";
import { clearFinished, formatBytes, formatSpeed } from "@/lib/download";
import type { DownloadItem } from "@/lib/download";
import { filenameFromUrl } from "@/lib/format";
import { resumeAll } from "@/lib/settings";
import { DownloadRow } from "@/components/DownloadRow";
import { GameGroup, type GameRow } from "@/components/GameGroup";
import { useAppStore, type GameJob } from "@/store/useAppStore";
import "./Downloads.css";

const RESUMABLE_STATUSES = ["paused", "failed"];
const FINISHED_STATUSES = ["done", "failed", "cancelled"];
const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

type RenderGroup = {
  key: string;
  title: string;
  cover: string;
  phase: string;
  rows: GameRow[];
};

export default function Downloads() {
  const downloads = useAppStore((s) => s.downloads);
  const activeJob = useAppStore((s) => s.activeJob);
  const queue = useAppStore((s) => s.extractionQueue);
  const dropFinished = useAppStore((s) => s.dropFinished);

  const items = Object.values(downloads);
  const byFilename = new Map(items.map((i) => [i.filename, i]));

  const resumableCount = items.filter((i) =>
    RESUMABLE_STATUSES.includes(i.status)
  ).length;
  const finishedCount = items.filter((i) =>
    FINISHED_STATUSES.includes(i.status)
  ).length;
  const activeItems = items.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const totalSpeed = activeItems.reduce((s, i) => s + i.speedBps, 0);
  const sumTotal = activeItems.reduce((s, i) => s + i.totalBytes, 0);
  const sumDone = activeItems.reduce((s, i) => s + i.downloadedBytes, 0);
  const overallPercent = sumTotal > 0 ? Math.floor((sumDone / sumTotal) * 100) : 0;

  // Build the rows for a job from its selected parts, matching each to a live
  // download by filename (placeholder until its link resolves).
  const claimed = new Set<string>();
  const jobRows = (job: GameJob): GameRow[] =>
    job.partUrls.map((u) => {
      const filename = filenameFromUrl(u);
      const item = byFilename.get(filename);
      if (item) claimed.add(item.id);
      return { filename, item };
    });

  const groups: RenderGroup[] = [];
  if (activeJob) {
    const rows = jobRows(activeJob);
    const resolved = rows.filter((r) => r.item).length;
    groups.push({
      key: activeJob.url,
      title: activeJob.gameTitle,
      cover: activeJob.gameCover,
      phase: resolved < rows.length ? `Getting links ${resolved}/${rows.length}` : "",
      rows,
    });
  }
  for (const job of queue) {
    groups.push({
      key: job.url,
      title: job.gameTitle,
      cover: job.gameCover,
      phase: "Queued",
      rows: jobRows(job),
    });
  }

  // Downloads not owned by an active/queued job: group finished games by title,
  // keep manual (no game) downloads as loose rows.
  const byTitle = new Map<string, { cover: string; items: DownloadItem[] }>();
  const loose: DownloadItem[] = [];
  for (const item of items) {
    if (claimed.has(item.id)) continue;
    if (!item.gameTitle) {
      loose.push(item);
      continue;
    }
    const g = byTitle.get(item.gameTitle);
    if (g) g.items.push(item);
    else byTitle.set(item.gameTitle, { cover: item.gameCover, items: [item] });
  }
  for (const [title, g] of byTitle) {
    groups.push({
      key: title,
      title,
      cover: g.cover,
      phase: "",
      rows: g.items.map((i) => ({ filename: i.filename, item: i })),
    });
  }

  const isEmpty = groups.length === 0 && loose.length === 0;

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
          ↓ {formatSpeed(totalSpeed)} · {formatBytes(sumDone)} /{" "}
          {formatBytes(sumTotal)} ({overallPercent}%) · {activeItems.length} active
        </div>
      )}
      {isEmpty && <p className="downloads-empty">No downloads yet.</p>}
      {groups.map((g) => (
        <GameGroup
          key={g.key}
          title={g.title}
          cover={g.cover}
          phase={g.phase}
          rows={g.rows}
        />
      ))}
      {loose.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </div>
  );
}
