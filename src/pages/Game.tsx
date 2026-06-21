import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  cancelExtraction,
  extractLinks,
  fetchParts,
  onExtractProgress,
  type ExtractProgress,
} from "@/lib/api";
import { failedSourceUrls } from "@/lib/extract";
import { filenameFromUrl } from "@/lib/format";
import "./Game.css";

type Part = { url: string; checked: boolean };

function partStatusClass(status: ExtractProgress["status"]): string {
  if (status === "done") return "part-status--done";
  if (status === "failed") return "part-status--failed";
  return "part-status--pending";
}

function statusText(status: ExtractProgress["status"]): string {
  switch (status) {
    case "processing":
      return "working…";
    case "needs_captcha":
      return "solve the captcha in the opened window";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

export default function Game() {
  const [url, setUrl] = useState(
    "https://fitgirl-repacks.site/grand-theft-auto-v/"
  );
  const [status, setStatus] = useState("Waiting for input…");
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ExtractProgress>>({});
  const cancelledRef = useRef(false);

  useEffect(() => {
    const un = onExtractProgress((p) => {
      setResults((prev) => ({ ...prev, [p.sourceUrl]: p }));
      // Don't let a trailing per-part event overwrite the final summary.
      if (cancelledRef.current) return;
      setStatus(`Part ${p.index + 1}/${p.total}: ${statusText(p.status)}`);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  async function onFetch() {
    setBusy(true);
    setParts([]);
    setResults({});
    setStatus("Fetching page…");
    try {
      const res = await fetchParts(url.trim());
      if (!res.valid) {
        setStatus("Not an official fitgirl-repacks.site URL.");
        return;
      }
      if (res.parts.length === 0) {
        setStatus("No fuckingfast links found on this page.");
        return;
      }
      setParts(res.parts.map((u) => ({ url: u, checked: true })));
      setStatus(`Found ${res.parts.length} parts. Uncheck unwanted, then Extract.`);
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onExtract() {
    const checked = parts.filter((p) => p.checked);
    if (checked.length === 0) {
      setStatus("No parts selected.");
      return;
    }
    // Resume: skip parts already resolved, so re-running after a cancel
    // continues from where it stopped instead of starting over.
    const pending = checked
      .filter((p) => results[p.url]?.status !== "done")
      .map((p) => p.url);
    if (pending.length === 0) {
      setStatus("All selected parts already extracted.");
      return;
    }
    cancelledRef.current = false;
    setBusy(true);
    setStatus(`Extracting ${pending.length} remaining part(s)…`);
    try {
      await extractLinks(pending);
      setStatus(cancelledRef.current ? "Cancelled." : "Extraction complete.");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    cancelledRef.current = true;
    setStatus("Cancelling…");
    try {
      await cancelExtraction();
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    }
  }

  async function onRetryFailed() {
    const failed = failedSourceUrls(results);
    if (failed.length === 0) return;
    cancelledRef.current = false;
    setBusy(true);
    setStatus(`Retrying ${failed.length} failed part(s)…`);
    try {
      await extractLinks(failed);
      setStatus(cancelledRef.current ? "Cancelled." : "Retry complete.");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggle(idx: number) {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, checked: !p.checked } : p))
    );
  }

  const directLinks = parts
    .map((p) => results[p.url]?.directUrl)
    .filter((x): x is string => !!x);

  const hasResumed = parts.some((p) => results[p.url]?.status === "done");
  const extractLabel = hasResumed ? "Continue" : "Extract selected";

  return (
    <main className="game-page dark">
      <h1 className="game-title">FitGirl Downloader — Extract</h1>

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

      <p className="status-text">{status}</p>

      {parts.length > 0 && (
        <div className="part-list">
          <div className="part-scroll">
            {parts.map((p, i) => {
              const r = results[p.url];
              return (
                <label key={p.url} className="part-row">
                  <Checkbox checked={p.checked} onCheckedChange={() => toggle(i)} />
                  <span className="part-name">{filenameFromUrl(p.url)}</span>
                  {r && (
                    <span className={partStatusClass(r.status)}>{r.status}</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="controls-row">
            <Button onClick={onExtract} disabled={busy}>
              {extractLabel}
            </Button>
            {busy && (
              <Button variant="destructive" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {!busy && failedSourceUrls(results).length > 0 && (
              <Button variant="secondary" onClick={onRetryFailed}>
                Retry failed ({failedSourceUrls(results).length})
              </Button>
            )}
          </div>
        </div>
      )}

      {directLinks.length > 0 && (
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
        </div>
      )}
    </main>
  );
}
