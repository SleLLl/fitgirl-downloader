import { type Repack } from "@/lib/showcase";
import { useGameDetails } from "@/hooks/useGameDetails";

export function RepackCard({
  repack,
  onSelect,
}: {
  repack: Repack;
  onSelect: (repack: Repack) => void;
}) {
  // Search results carry no cover; fetch it lazily (non-blocking) from the game
  // page. This also warms the detail-page cache, so opening the card is instant.
  const details = useGameDetails(repack.coverUrl ? "" : repack.pageUrl);
  const cover = repack.coverUrl || details.data?.coverUrl;

  const handlePick = () => onSelect(repack);

  return (
    <button className="repack-card" onClick={handlePick}>
      {cover ? (
        <img className="repack-cover" src={cover} alt={repack.title} loading="lazy" />
      ) : (
        <div className="repack-cover repack-cover--pending" />
      )}
      <span className="repack-title">{repack.title}</span>
    </button>
  );
}
