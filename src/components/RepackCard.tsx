import { type Repack } from "@/lib/showcase";
import { useAppStore } from "@/store/useAppStore";

export function RepackCard({ repack }: { repack: Repack }) {
  const setUrl = useAppStore((s) => s.setUrl);
  const setTab = useAppStore((s) => s.setTab);

  const handlePick = () => {
    setUrl(repack.pageUrl);
    setTab("extract");
  };

  return (
    <button className="repack-card" onClick={handlePick}>
      <img
        className="repack-cover"
        src={repack.coverUrl}
        alt={repack.title}
        loading="lazy"
      />
      <span className="repack-title">{repack.title}</span>
    </button>
  );
}
