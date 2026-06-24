import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useDownloads } from "@/hooks/useDownloads";
import { buildRequests } from "@/lib/download";

export function LinksPanel() {
  const parts = useAppStore((s) => s.parts);
  const results = useAppStore((s) => s.results);
  const busy = useAppStore((s) => s.busy);
  const { onDownloadAll } = useDownloads();
  const navigate = useNavigate();

  const directLinks = parts
    .map((part) => results[part.url]?.directUrl)
    .filter((link): link is string => !!link);
  const downloadable = buildRequests(results);
  const canDownloadAll = !busy && downloadable.length > 0;

  const handleCopy = () =>
    navigator.clipboard.writeText(directLinks.join("\n"));
  const handleDownloadAll = async () => {
    await onDownloadAll();
    navigate({ to: "/downloads" });
  };

  if (directLinks.length === 0) return null;

  return (
    <div className="links-section">
      <h2 className="links-heading">Direct links ({directLinks.length})</h2>
      <textarea readOnly className="links-output" value={directLinks.join("\n")} />
      <Button onClick={handleCopy}>Copy all</Button>
      <Button
        variant="secondary"
        onClick={handleDownloadAll}
        disabled={!canDownloadAll}
      >
        Download all ({downloadable.length})
      </Button>
    </div>
  );
}
