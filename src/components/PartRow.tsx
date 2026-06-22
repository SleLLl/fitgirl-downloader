import { MouseEvent } from "react";
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
  const result = useAppStore((s) => s.results[part.url]);
  const togglePart = useAppStore((s) => s.togglePart);
  const downloads = useAppStore((s) => s.downloads);
  const { onDownloadOne } = useDownloads();

  const filename = filenameFromUrl(part.url);
  const download = Object.values(downloads).find(
    (item) => item.filename === filename
  );
  const percent =
    download && download.totalBytes > 0
      ? Math.floor((download.downloadedBytes / download.totalBytes) * 100)
      : 0;
  const canDownload =
    result?.status === "done" && !!result.directUrl && !download;

  const handleToggle = () => togglePart(index);
  const handleDownload = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void onDownloadOne(part.url);
  };

  return (
    <label className="part-row">
      <Checkbox checked={part.checked} onCheckedChange={handleToggle} />
      <span className="part-name">{filename}</span>
      {result && (
        <span className={partStatusClass(result.status)}>{result.status}</span>
      )}
      {download && (
        <span className="part-dl">
          {percent}% · {download.status}
        </span>
      )}
      {canDownload && (
        <Button variant="secondary" onClick={handleDownload}>
          Download
        </Button>
      )}
    </label>
  );
}
