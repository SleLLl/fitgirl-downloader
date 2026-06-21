import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/useAppStore";
import { useExtraction } from "@/hooks/useExtraction";

export function UrlBar() {
  const url = useAppStore((s) => s.url);
  const setUrl = useAppStore((s) => s.setUrl);
  const busy = useAppStore((s) => s.busy);
  const { onFetch } = useExtraction();
  return (
    <div className="url-row">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://fitgirl-repacks.site/<game>/"
      />
      <Button onClick={onFetch} disabled={busy}>
        Fetch links
      </Button>
    </div>
  );
}
