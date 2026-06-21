import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useExtraction } from "@/hooks/useExtraction";
import { failedSourceUrls } from "@/lib/extract";

export function ExtractControls() {
  const busy = useAppStore((s) => s.busy);
  const parts = useAppStore((s) => s.parts);
  const results = useAppStore((s) => s.results);
  const { onExtract, onCancel, onRetryFailed } = useExtraction();
  const hasResumed = parts.some((p) => results[p.url]?.status === "done");
  const extractLabel = hasResumed ? "Continue" : "Extract selected";
  const failed = failedSourceUrls(results);
  return (
    <div className="controls-row">
      <Button onClick={onExtract} disabled={busy}>
        {extractLabel}
      </Button>
      {busy && (
        <Button variant="destructive" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {!busy && failed.length > 0 && (
        <Button variant="secondary" onClick={onRetryFailed}>
          Retry failed ({failed.length})
        </Button>
      )}
    </div>
  );
}
