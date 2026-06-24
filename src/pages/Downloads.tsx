import { Button } from "@/components/ui/button";
import { clearFinished, formatBytes, formatSpeed } from "@/lib/download";
import type { DownloadItem } from "@/lib/download";
import { resumeAll } from "@/lib/settings";
import { DownloadRow } from "@/components/DownloadRow";
import { GameGroup } from "@/components/GameGroup";
import { useAppStore } from "@/store/useAppStore";
import "./Downloads.css";

const RESUMABLE_STATUSES = ["paused", "failed"];
const FINISHED_STATUSES = ["done", "failed", "cancelled"];
const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

type Group = { title: string; cover: string; items: DownloadItem[] };

/// Split downloads into per-game groups (by gameTitle) and loose items (manual /
/// "Add by link" downloads with no game). Active game first, then by recency.
function groupDownloads(
  items: DownloadItem[],
  activeTitle: string | null
): { groups: Group[]; loose: DownloadItem[] } {
  const byTitle = new Map<string, Group>();
  const loose: DownloadItem[] = [];
  for (const item of items) {
    if (!item.gameTitle) {
      loose.push(item);
      continue;
    }
    const group = byTitle.get(item.gameTitle);
    if (group) {
      group.items.push(item);
      if (!group.cover && item.gameCover) group.cover = item.gameCover;
    } else {
      byTitle.set(item.gameTitle, {
        title: item.gameTitle,
        cover: item.gameCover,
        items: [item],
      });
    }
  }
  const groups = [...byTitle.values()];
  groups.sort((a, b) => {
    if (a.title === activeTitle) return -1;
    if (b.title === activeTitle) return 1;
    return 0;
  });
  return { groups, loose };
}

export default function Downloads() {
  const downloads = useAppStore((s) => s.downloads);
  const autoDownload = useAppStore((s) => s.autoDownload);
  const extractionCache = useAppStore((s) => s.extractionCache);
  const dropFinished = useAppStore((s) => s.dropFinished);

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

  // The game currently resolving links (if any) gets a "Getting links X/N" phase
  // and is surfaced even before its first download exists.
  const cached = autoDownload ? extractionCache[autoDownload.url] : undefined;
  const gettingLinks = autoDownload
    ? {
        got: cached
          ? Object.values(cached.results).filter((r) => r.directUrl).length
          : 0,
        total: cached?.parts.length ?? 0,
      }
    : null;

  const { groups, loose } = groupDownloads(items, autoDownload?.gameTitle ?? null);
  if (autoDownload && !groups.some((g) => g.title === autoDownload.gameTitle)) {
    groups.unshift({
      title: autoDownload.gameTitle,
      cover: autoDownload.gameCover,
      items: [],
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
          ↓ {formatSpeed(totalSpeed)} · {formatBytes(downloadedBytes)} /{" "}
          {formatBytes(totalBytes)} ({overallPercent}%) · {activeItems.length}{" "}
          active
        </div>
      )}
      {isEmpty && <p className="downloads-empty">No downloads yet.</p>}
      {groups.map((group) => (
        <GameGroup
          key={group.title}
          title={group.title}
          cover={group.cover}
          items={group.items}
          gettingLinks={
            autoDownload?.gameTitle === group.title ? gettingLinks : null
          }
        />
      ))}
      {loose.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </div>
  );
}
