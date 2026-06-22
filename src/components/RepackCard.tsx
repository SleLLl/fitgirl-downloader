import { type Repack } from "@/lib/showcase";

export function RepackCard({
  repack,
  onSelect,
}: {
  repack: Repack;
  onSelect: (repack: Repack) => void;
}) {
  const handlePick = () => onSelect(repack);

  return (
    <button className="repack-card" onClick={handlePick}>
      {repack.coverUrl ? (
        <img
          className="repack-cover"
          src={repack.coverUrl}
          alt={repack.title}
          loading="lazy"
        />
      ) : (
        <div className="repack-cover" />
      )}
      <span className="repack-title">{repack.title}</span>
    </button>
  );
}
