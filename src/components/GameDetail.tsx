import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PartList } from "@/components/PartList";
import { useGameDetails } from "@/hooks/useGameDetails";
import { useExtraction } from "@/hooks/useExtraction";
import { useDownloads } from "@/hooks/useDownloads";
import { enqueueGame } from "@/lib/downloadQueue";
import { useAppStore } from "@/store/useAppStore";
import "./GameDetail.css";

const ACTIVE_STATUSES = ["downloading", "queued", "paused"];

export function GameDetail({
  pageUrl,
  onBack,
}: {
  pageUrl: string;
  onBack: () => void;
}) {
  const { data: details, error, isLoading, refetch } = useGameDetails(pageUrl);
  const parts = useAppStore((s) => s.parts);
  const busy = useAppStore((s) => s.busy);
  const activeJob = useAppStore((s) => s.activeJob);
  const queue = useAppStore((s) => s.extractionQueue);
  const downloads = useAppStore((s) => s.downloads);
  const navigate = useNavigate();
  const { onFetch } = useExtraction();
  const { ensureDir } = useDownloads();

  // Point the extraction context at this game; show cached parts if we already
  // fetched them, otherwise start clean.
  useEffect(() => {
    const store = useAppStore.getState();
    store.setUrl(pageUrl);
    store.setStatus("");
    const cached = store.extractionCache[pageUrl];
    if (cached && cached.parts.length) {
      store.loadExtraction(cached.parts, cached.results);
    } else {
      store.resetExtraction();
    }
  }, [pageUrl]);

  // Correct game metadata for any manual per-part download from this page.
  useEffect(() => {
    if (details) useAppStore.getState().setGame(details.title, details.coverUrl);
  }, [details]);

  // This game is already being handled (extracting, queued, or actively
  // downloading) — don't let the user re-queue it.
  const inProgress =
    activeJob?.url === pageUrl ||
    queue.some((j) => j.url === pageUrl) ||
    (!!details &&
      Object.values(downloads).some(
        (d) => d.gameTitle === details.title && ACTIVE_STATUSES.includes(d.status)
      ));

  const checkedCount = parts.filter((p) => p.checked).length;
  const hasParts = parts.length > 0;

  const handleRetry = () => refetch();
  const handleView = () => navigate({ to: "/downloads" });
  const handleGetLinks = () => {
    void onFetch();
  };
  const handleSelectAll = () => useAppStore.getState().setAllChecked(true);
  const handleSelectNone = () => useAppStore.getState().setAllChecked(false);
  const handleDownloadSelected = async () => {
    if (!details) return;
    const checked = useAppStore.getState().parts.filter((p) => p.checked);
    if (checked.length === 0) {
      useAppStore.getState().setStatus("Select at least one file.");
      return;
    }
    const dir = await ensureDir();
    if (!dir) return;
    navigate({ to: "/downloads" });
    void enqueueGame({
      url: pageUrl,
      gameTitle: details.title,
      gameCover: details.coverUrl,
      partUrls: checked.map((p) => p.url),
    });
  };

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        {inProgress ? (
          <Button onClick={handleView}>View in Downloads</Button>
        ) : !hasParts ? (
          <Button onClick={handleGetLinks} disabled={busy || !details}>
            Get download links
          </Button>
        ) : null}
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
          {!inProgress && hasParts && (
            <div className="detail-download">
              <div className="detail-select-bar">
                <span className="detail-select-count">
                  {checkedCount}/{parts.length} files selected
                </span>
                <Button variant="secondary" onClick={handleSelectAll}>
                  All
                </Button>
                <Button variant="secondary" onClick={handleSelectNone}>
                  None
                </Button>
              </div>
              <PartList />
              <Button
                onClick={handleDownloadSelected}
                disabled={busy || checkedCount === 0}
              >
                Download selected ({checkedCount})
              </Button>
            </div>
          )}
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
