import { Button } from "@/components/ui/button";
import { RepackCard } from "@/components/RepackCard";
import { usePopular } from "@/hooks/usePopular";
import { type Repack } from "@/lib/showcase";
import "./Browse.css";

export default function Browse({
  onSelect,
}: {
  onSelect: (repack: Repack) => void;
}) {
  const { data: repacks = [], isLoading, error, refetch } = usePopular();

  const handleRetry = () => refetch();

  return (
    <div className="browse-page">
      <div className="browse-header">
        <h2 className="browse-title">Popular repacks ({repacks.length})</h2>
        {isLoading && <span className="browse-loading">Loading…</span>}
      </div>
      {error && (
        <p className="browse-error">
          {String(error)}{" "}
          <Button variant="secondary" onClick={handleRetry}>
            Retry
          </Button>
        </p>
      )}
      <div className="repack-grid">
        {repacks.map((repack) => (
          <RepackCard
            key={repack.pageUrl}
            repack={repack}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
