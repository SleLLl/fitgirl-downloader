import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore, type Part } from "@/store/useAppStore";
import { useDownloads } from "@/hooks/useDownloads";
import { filenameFromUrl } from "@/lib/format";

function partStatusClass(status: string): string {
  if (status === "done") return "part-status--done";
  if (status === "failed") return "part-status--failed";
  return "part-status--pending";
}

export function PartRow({ part, index }: { part: Part; index: number }) {
  const r = useAppStore((s) => s.results[part.url]);
  const togglePart = useAppStore((s) => s.togglePart);
  const downloads = useAppStore((s) => s.downloads);
  const { onDownloadOne } = useDownloads();
  const filename = filenameFromUrl(part.url);
  const dl = Object.values(downloads).find((d) => d.filename === filename);
  const pct =
    dl && dl.totalBytes > 0
      ? Math.floor((dl.downloadedBytes / dl.totalBytes) * 100)
      : 0;

  return (
    <label className="part-row">
      <Checkbox checked={part.checked} onCheckedChange={() => togglePart(index)} />
      <span className="part-name">{filename}</span>
      {r && <span className={partStatusClass(r.status)}>{r.status}</span>}
      {dl && (
        <span className="part-dl">
          {pct}% · {dl.status}
        </span>
      )}
      {r?.status === "done" && r.directUrl && !dl && (
        <Button
          variant="secondary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDownloadOne(part.url);
          }}
        >
          Download
        </Button>
      )}
    </label>
  );
}
