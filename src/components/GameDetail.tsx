import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scrapeGame, type GameDetails } from "@/lib/showcase";
import { useAppStore } from "@/store/useAppStore";
import "./GameDetail.css";

export function GameDetail({
  pageUrl,
  onBack,
}: {
  pageUrl: string;
  onBack: () => void;
}) {
  const setUrl = useAppStore((s) => s.setUrl);
  const setTab = useAppStore((s) => s.setTab);
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setDetails(null);
    try {
      setDetails(await scrapeGame(pageUrl));
    } catch (caught) {
      setError(String(caught));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrl]);

  const handleExtract = () => {
    setUrl(pageUrl);
    setTab("extract");
  };

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleExtract}>Extract & download</Button>
        <a
          className="detail-link"
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open on FitGirl
        </a>
      </div>
      {error && (
        <p className="detail-error">
          {error}{" "}
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </p>
      )}
      {!details && !error && <p className="detail-loading">Loading…</p>}
      {details && (
        <>
          <h2 className="detail-title">{details.title}</h2>
          <div className="detail-top">
            {details.coverUrl && (
              <img
                className="detail-cover"
                src={details.coverUrl}
                alt={details.title}
              />
            )}
            <ul className="detail-info">
              {details.info.map((field) => (
                <li key={field.label}>
                  <span className="detail-info-label">{field.label}:</span>{" "}
                  {field.value}
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-shots">
            {details.screenshots.map((shot) => (
              <img
                key={shot}
                className="detail-shot"
                src={shot}
                alt=""
                loading="lazy"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
