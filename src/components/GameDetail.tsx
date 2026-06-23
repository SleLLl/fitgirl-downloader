import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DownloadPanel } from "@/components/DownloadPanel";
import { useGameDetails } from "@/hooks/useGameDetails";
import { useExtraction } from "@/hooks/useExtraction";
import { useAppStore } from "@/store/useAppStore";
import "./GameDetail.css";

export function GameDetail({
  pageUrl,
  onBack,
}: {
  pageUrl: string;
  onBack: () => void;
}) {
  const { data: details, error, isLoading, refetch } = useGameDetails(pageUrl);
  const setUrl = useAppStore((s) => s.setUrl);
  const setGame = useAppStore((s) => s.setGame);
  const setStatus = useAppStore((s) => s.setStatus);
  const resetExtraction = useAppStore((s) => s.resetExtraction);
  const busy = useAppStore((s) => s.busy);
  const hasParts = useAppStore((s) => s.parts.length > 0);
  const { onFetch } = useExtraction();

  // Point the extraction context at this game and clear any prior game's parts.
  useEffect(() => {
    setUrl(pageUrl);
    setGame("", "");
    resetExtraction();
    setStatus("");
  }, [pageUrl, setUrl, setGame, resetExtraction, setStatus]);

  // Carry the game's title + cover into the download jobs once known.
  useEffect(() => {
    if (details) setGame(details.title, details.coverUrl);
  }, [details, setGame]);

  const handleRetry = () => refetch();
  const handleGetLinks = () => {
    void onFetch();
  };

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
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
          {String(error)}{" "}
          <Button variant="secondary" onClick={handleRetry}>
            Retry
          </Button>
        </p>
      )}
      {isLoading && <p className="detail-loading">Loading…</p>}
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
          <div className="detail-download">
            {!hasParts && (
              <Button onClick={handleGetLinks} disabled={busy}>
                Get download links
              </Button>
            )}
            <DownloadPanel />
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
