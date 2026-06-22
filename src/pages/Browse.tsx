import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RepackCard } from "@/components/RepackCard";
import { scrapePopular, type Repack } from "@/lib/showcase";
import "./Browse.css";

export default function Browse() {
  const [repacks, setRepacks] = useState<Repack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRepacks(await scrapePopular());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repacks.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="browse-page">
      <div className="browse-header">
        <h2 className="browse-title">Popular repacks ({repacks.length})</h2>
        {loading && <span className="browse-loading">Loading…</span>}
      </div>
      {error && (
        <p className="browse-error">
          {error}{" "}
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </p>
      )}
      <div className="repack-grid">
        {repacks.map((repack) => (
          <RepackCard key={repack.pageUrl} repack={repack} />
        ))}
      </div>
    </div>
  );
}
