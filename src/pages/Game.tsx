import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  extractLinks,
  fetchParts,
  onExtractProgress,
  type ExtractProgress,
} from "@/lib/api";
import { filenameFromUrl } from "@/lib/format";

type Part = { url: string; checked: boolean };

export default function Game() {
  const [url, setUrl] = useState(
    "https://fitgirl-repacks.site/grand-theft-auto-v/"
  );
  const [status, setStatus] = useState("Waiting for input…");
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ExtractProgress>>({});

  useEffect(() => {
    const un = onExtractProgress((p) => {
      setResults((prev) => ({ ...prev, [p.sourceUrl]: p }));
      setStatus(
        `Extracting ${p.index + 1}/${p.total} — ${p.status}` +
          (p.status === "needs_captcha" ? " (solve the captcha in the window)" : "")
      );
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
    const selected = parts.filter((p) => p.checked).map((p) => p.url);
    if (selected.length === 0) {
      setStatus("No parts selected.");
      return;
    }
    setBusy(true);
    setStatus("Starting extraction…");
    try {
      await extractLinks(selected);
      setStatus("Extraction complete.");
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

  return (
    <main className="dark min-h-screen bg-background text-foreground p-6 space-y-4">
      <h1 className="text-xl font-semibold">FitGirl Downloader — Extract</h1>

      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://fitgirl-repacks.site/<game>/"
        />
        <Button onClick={onFetch} disabled={busy}>
          Fetch links
        </Button>
      </div>

      <p className="text-sm text-muted-foreground italic">{status}</p>

      {parts.length > 0 && (
        <div className="space-y-2 border border-border rounded-md p-3">
          <div className="max-h-64 overflow-auto space-y-1">
            {parts.map((p, i) => {
              const r = results[p.url];
              return (
                <label key={p.url} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={p.checked} onCheckedChange={() => toggle(i)} />
                  <span className="flex-1">{filenameFromUrl(p.url)}</span>
                  {r && (
                    <span
                      className={
                        r.status === "done"
                          ? "text-green-400"
                          : r.status === "failed"
                          ? "text-red-400"
                          : "text-yellow-400"
                      }
                    >
                      {r.status}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <Button onClick={onExtract} disabled={busy}>
            Extract selected
          </Button>
        </div>
      )}

      {directLinks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">
            Direct links ({directLinks.length})
          </h2>
          <textarea
            readOnly
            className="w-full h-40 bg-card border border-border rounded-md p-2 text-xs font-mono"
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
