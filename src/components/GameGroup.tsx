import { DownloadRow } from "@/components/DownloadRow";
import { formatBytes, type DownloadItem } from "@/lib/download";

export type GameRow = { filename: string; item?: DownloadItem };

/// A game's expected files under one header. Each row is either a live download
/// or a placeholder ("waiting for link") so the full file list is visible from
/// the moment the game is queued — nothing appears out of nowhere.
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
  const done = rows.filter((r) => r.item?.status === "done").length;
  const total = rows.length;
  const downloaded = rows.reduce((sum, r) => sum + (r.item?.downloadedBytes ?? 0), 0);
  const totalBytes = rows.reduce((sum, r) => sum + (r.item?.totalBytes ?? 0), 0);
  const meta = `${phase ? `${phase} · ` : ""}${done}/${total} downloaded · ${formatBytes(
    downloaded
  )} / ${formatBytes(totalBytes)}`;

  return (
    <div className="game-group">
      <div className="game-group-head">
        {cover && (
          <img
            className="game-group-cover"
            src={cover}
            alt={title}
            loading="lazy"
          />
        )}
        <div className="game-group-info">
          <span className="game-group-title">{title}</span>
          <span className="game-group-meta">{meta}</span>
        </div>
      </div>
      <div className="game-group-rows">
        {rows.map((row) =>
          row.item ? (
            <DownloadRow key={row.filename} item={row.item} />
          ) : (
            <div key={row.filename} className="pending-row">
              <span className="pending-name">{row.filename}</span>
              <span className="pending-status">waiting for link</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
