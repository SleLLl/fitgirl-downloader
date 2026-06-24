import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownloadRow } from "@/components/DownloadRow";
import {
  formatBytes,
  pauseDownload,
  resumeDownload,
  type DownloadItem,
} from "@/lib/download";

export type GameRow = { filename: string; item?: DownloadItem; label: string };

const PAUSABLE_STATUSES = ["downloading", "queued"];
const RESUMABLE_STATUSES = ["paused", "failed"];

/// A game's expected files under one collapsible header. Each row is either a
/// live download or a placeholder ("waiting for link") so the full file list is
/// visible from the moment the game is queued. The header carries per-game
/// Resume all / Pause all.
export function GameGroup({
  title,
  cover,
  phase,
  rows,
}: {
  title: string;
  cover: string;
  phase: string;
  rows: GameRow[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const toggle = () => setCollapsed((c) => !c);

  const items = rows
    .map((r) => r.item)
    .filter((i): i is DownloadItem => !!i);
  const pausable = items.filter((i) => PAUSABLE_STATUSES.includes(i.status));
  const resumable = items.filter((i) => RESUMABLE_STATUSES.includes(i.status));

  const done = rows.filter((r) => r.item?.status === "done").length;
  const total = rows.length;
  const downloaded = rows.reduce((sum, r) => sum + (r.item?.downloadedBytes ?? 0), 0);
  const totalBytes = rows.reduce((sum, r) => sum + (r.item?.totalBytes ?? 0), 0);
  const meta = `${phase ? `${phase} · ` : ""}${done}/${total} downloaded · ${formatBytes(
    downloaded
  )} / ${formatBytes(totalBytes)}`;

  const handleResumeAll = () => resumable.forEach((i) => resumeDownload(i.id));
  const handlePauseAll = () => pausable.forEach((i) => void pauseDownload(i.id));

  return (
    <div className="game-group">
      <div className="game-group-head">
        <button
          className="game-group-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight size={18} className="game-group-chevron" aria-hidden />
          ) : (
            <ChevronDown size={18} className="game-group-chevron" aria-hidden />
          )}
          {cover && (
            <img
              className="game-group-cover"
              src={cover}
              alt={title}
              loading="lazy"
            />
          )}
          <span className="game-group-info">
            <span className="game-group-title">{title}</span>
            <span className="game-group-meta">{meta}</span>
          </span>
        </button>
        <div className="game-group-actions">
          {resumable.length > 0 && (
            <Button variant="secondary" onClick={handleResumeAll}>
              Resume all ({resumable.length})
            </Button>
          )}
          {pausable.length > 0 && (
            <Button variant="secondary" onClick={handlePauseAll}>
              Pause all ({pausable.length})
            </Button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="game-group-rows">
          {rows.map((row) =>
            row.item ? (
              <DownloadRow key={row.filename} item={row.item} />
            ) : (
              <div key={row.filename} className="pending-row">
                <span className="pending-name">{row.filename}</span>
                <span className="pending-status">{row.label}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
