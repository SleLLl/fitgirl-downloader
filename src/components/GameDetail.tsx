import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useGameDetails } from "@/hooks/useGameDetails";
import { useExtraction } from "@/hooks/useExtraction";
import { useDownloads } from "@/hooks/useDownloads";
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
  const setStatus = useAppStore((s) => s.setStatus);
  const resetExtraction = useAppStore((s) => s.resetExtraction);
  const busy = useAppStore((s) => s.busy);
  const navigate = useNavigate();
  const { onFetch, onExtract } = useExtraction();
  const { ensureDir, queuePart } = useDownloads();

  // Point the extraction context at this game; leave any in-flight auto-download
  // (autoDownload) untouched so it keeps queueing if the user is just browsing.
  useEffect(() => {
    setUrl(pageUrl);
    resetExtraction();
    setStatus("");
  }, [pageUrl, setUrl, resetExtraction, setStatus]);

  const handleRetry = () => refetch();

  // Get links for this game and download them: jump to Downloads immediately,
  // queue any cached links, then extract the rest (each auto-queues on resolve).
  const handleGetAndDownload = async () => {
    if (!details) return;
    const dir = await ensureDir();
    if (!dir) return;
    const meta = { gameTitle: details.title, gameCover: details.coverUrl };
    const store = useAppStore.getState();
    store.setAutoDownload({ url: pageUrl, ...meta });
    navigate({ to: "/downloads" });

    const cached = store.extractionCache[pageUrl];
    if (cached && cached.parts.length) {
      store.loadExtraction(cached.parts, cached.results);
      for (const part of cached.parts) {
        const resolved = cached.results[part.url];
        if (resolved?.directUrl) queuePart(resolved, dir, meta);
      }
    }
    if (useAppStore.getState().parts.length === 0) await onFetch();
    if (useAppStore.getState().parts.length > 0) await onExtract();
    // Disarm only if this game is still the armed one (the user may have started
    // another download meanwhile).
    if (useAppStore.getState().autoDownload?.url === pageUrl) {
      useAppStore.getState().setAutoDownload(null);
    }
  };

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleGetAndDownload} disabled={busy || !details}>
          Get links &amp; download
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
