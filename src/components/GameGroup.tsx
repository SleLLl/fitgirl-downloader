import { DownloadRow } from "@/components/DownloadRow";
import { formatBytes, type DownloadItem } from "@/lib/download";

/// A game's downloads grouped under one header showing the extraction phase
/// ("Getting links X/N") and an aggregate of its parts.
export function GameGroup({
  title,
  cover,
  items,
  gettingLinks,
}: {
  title: string;
  cover: string;
  items: DownloadItem[];
  gettingLinks: { got: number; total: number } | null;
}) {
  const done = items.filter((i) => i.status === "done").length;
  const total = Math.max(items.length, gettingLinks?.total ?? 0);
  const downloaded = items.reduce((sum, i) => sum + i.downloadedBytes, 0);
  const totalBytes = items.reduce((sum, i) => sum + i.totalBytes, 0);

  let linkPhase = "";
  if (gettingLinks && gettingLinks.total === 0) {
    linkPhase = "Getting links… · ";
  } else if (gettingLinks && gettingLinks.got < gettingLinks.total) {
    linkPhase = `Getting links ${gettingLinks.got}/${gettingLinks.total} · `;
  }
  const meta = `${linkPhase}${done}/${total} downloaded · ${formatBytes(
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
        {items.map((item) => (
          <DownloadRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
