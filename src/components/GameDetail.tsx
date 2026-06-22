import { Button } from "@/components/ui/button";
import { useGameDetails } from "@/hooks/useGameDetails";
import "./GameDetail.css";

export function GameDetail({
  pageUrl,
  onBack,
  onExtract,
}: {
  pageUrl: string;
  onBack: () => void;
  onExtract: () => void;
}) {
  const { data: details, error, isLoading, refetch } = useGameDetails(pageUrl);

  const handleRetry = () => refetch();

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onExtract}>Extract & download</Button>
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
