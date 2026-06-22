import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scrapePopular, type Repack } from "@/lib/showcase";
import { useAppStore } from "@/store/useAppStore";
import "./Browse.css";

export default function Browse() {
  const setUrl = useAppStore((s) => s.setUrl);
  const setTab = useAppStore((s) => s.setTab);
  const [repacks, setRepacks] = useState<Repack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRepacks(await scrapePopular());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repacks.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(r: Repack) {
    setUrl(r.pageUrl);
    setTab("extract");
  }

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
        {repacks.map((r) => (
          <button key={r.pageUrl} className="repack-card" onClick={() => pick(r)}>
            <img
              className="repack-cover"
              src={r.coverUrl}
              alt={r.title}
              loading="lazy"
            />
            <span className="repack-title">{r.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
