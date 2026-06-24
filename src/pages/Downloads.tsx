import { Button } from "@/components/ui/button";
import {
  clearFinished,
  formatBytes,
  formatSpeed,
  pauseDownload,
} from "@/lib/download";
import type { DownloadItem } from "@/lib/download";
import { filenameFromUrl } from "@/lib/format";
import { resumeAll } from "@/lib/settings";
import { DownloadRow } from "@/components/DownloadRow";
import { GameGroup, type GameRow } from "@/components/GameGroup";
import { useAppStore, type GameJob } from "@/store/useAppStore";
import "./Downloads.css";

const RESUMABLE_STATUSES = ["paused", "failed"];
const PAUSABLE_STATUSES = ["downloading", "queued"];
const FINISHED_STATUSES = ["done", "failed", "cancelled"];
const ACTIVE_STATUSES = ["downloading", "queued", "paused"];
const JOB_ORDER: Record<string, number> = { extracting: 0, queued: 1, done: 2 };

type RenderGroup = {
  key: string;
  title: string;
  cover: string;
  phase: string;
  rows: GameRow[];
};

export default function Downloads() {
  const downloads = useAppStore((s) => s.downloads);
  const gameJobs = useAppStore((s) => s.gameJobs);
  const dropFinished = useAppStore((s) => s.dropFinished);

  const items = Object.values(downloads);
  const byFilename = new Map(items.map((i) => [i.filename, i]));

  const resumableCount = items.filter((i) =>
    RESUMABLE_STATUSES.includes(i.status)
  ).length;
  const pausable = items.filter((i) => PAUSABLE_STATUSES.includes(i.status));
  const finishedCount = items.filter((i) =>
    FINISHED_STATUSES.includes(i.status)
  ).length;
  const activeItems = items.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const totalSpeed = activeItems.reduce((s, i) => s + i.speedBps, 0);
  const sumTotal = activeItems.reduce((s, i) => s + i.totalBytes, 0);
  const sumDone = activeItems.reduce((s, i) => s + i.downloadedBytes, 0);
  const overallPercent = sumTotal > 0 ? Math.floor((sumDone / sumTotal) * 100) : 0;

  // Each game job renders its full selected-file list (placeholder until a link
  // resolves into a real download), so rows never disappear mid-flight.
  const claimed = new Set<string>();
  const jobRows = (job: GameJob): GameRow[] =>
    job.partUrls.map((u) => {
      const filename = filenameFromUrl(u);
      const item = byFilename.get(filename);
      if (item) claimed.add(item.id);
      return { filename, item };
    });

  const phaseFor = (job: GameJob, rows: GameRow[]): string => {
    if (job.status === "queued") return "Queued";
    if (job.status === "extracting") {
      const resolved = rows.filter((r) => r.item).length;
      return resolved < rows.length ? `Getting links ${resolved}/${rows.length}` : "";
    }
    return "";
  };

  const groups: RenderGroup[] = [...gameJobs]
    .sort((a, b) => JOB_ORDER[a.status] - JOB_ORDER[b.status])
    .map((job) => {
      const rows = jobRows(job);
      return {
        key: job.url,
        title: job.gameTitle,
        cover: job.gameCover,
        phase: phaseFor(job, rows),
        rows,
      };
    });

  // Downloads with a game but no job (e.g. restored after a restart): group by
  // title. Manual (no game) downloads stay as loose rows.
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
  const handlePauseAll = () => pausable.forEach((i) => void pauseDownload(i.id));
  const handleClearFinished = () => {
    void clearFinished();
    dropFinished();
    // Drop fully-finished game cards so they don't linger forever.
    const store = useAppStore.getState();
    for (const job of store.gameJobs) {
      const rows = job.partUrls.map((u) => byFilename.get(filenameFromUrl(u)));
      const allFinished =
        job.status === "done" &&
        rows.every((it) => !it || FINISHED_STATUSES.includes(it.status));
      if (allFinished) store.removeJob(job.url);
    }
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
          {pausable.length > 0 && (
            <Button variant="secondary" onClick={handlePauseAll}>
              Pause all ({pausable.length})
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
