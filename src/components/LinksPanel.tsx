import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useDownloads } from "@/hooks/useDownloads";
import { buildRequests } from "@/lib/download";

export function LinksPanel() {
  const parts = useAppStore((s) => s.parts);
  const results = useAppStore((s) => s.results);
  const busy = useAppStore((s) => s.busy);
  const { onDownloadAll } = useDownloads();
  const directLinks = parts
    .map((p) => results[p.url]?.directUrl)
    .filter((x): x is string => !!x);
  const downloadable = buildRequests(results);
  if (directLinks.length === 0) return null;
  return (
    <div className="links-section">
      <h2 className="links-heading">Direct links ({directLinks.length})</h2>
      <textarea
        readOnly
        className="links-output"
        value={directLinks.join("\n")}
      />
      <Button
        onClick={() => navigator.clipboard.writeText(directLinks.join("\n"))}
      >
        Copy all
      </Button>
      <Button
        variant="secondary"
        onClick={onDownloadAll}
        disabled={busy || downloadable.length === 0}
      >
        Download all ({downloadable.length})
      </Button>
    </div>
  );
}
