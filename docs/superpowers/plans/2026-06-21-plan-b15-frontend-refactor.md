# Plan B1.5 — Frontend State & Component Refactor Implementation Plan

> **Execution note:** This is a tightly-coupled refactor (store ↔ hooks ↔ components ↔ pages change together), so it is executed INLINE by the controller, not split across independent subagents. Keep `Game.test.tsx` + `Downloads.test.tsx` green throughout to prove no behavioural regression. Commit after each numbered task.

**Goal:** Introduce a Zustand store as the single source of truth, split `Game.tsx` into focused subcomponents, wire events once at the top, and show per-part download progress inline + an active-count badge on the Downloads tab.

**Tech Stack:** React 19 + TypeScript, Zustand, Tailwind v4 + shadcn, vitest.

---

## File Structure

- `src/store/useAppStore.ts` — Zustand store (state + pure setters). Test: `useAppStore.test.ts`.
- `src/hooks/useExtraction.ts` — `onFetch/onExtract/onCancel/onRetryFailed` (Tauri + store).
- `src/hooks/useDownloads.ts` — `ensureDir/onDownloadAll/onDownloadOne`.
- `src/hooks/useAppEvents.ts` — one-time event subscriptions → store; seeds downloads.
- `src/components/{UrlBar,PartList,PartRow,ExtractControls,LinksPanel}.tsx` (+ `PartRow` reads downloads for the inline indicator).
- `src/pages/Game.tsx` — thin container. `src/pages/Downloads.tsx` — reads store.
- `src/App.tsx` — `useAppEvents()` + Downloads tab active-count badge.

---

### Task 1: Zustand store (TDD)

- Install: `npm install zustand`.
- Create `src/store/useAppStore.ts`:

```ts
import { create } from "zustand";
import type { ExtractProgress } from "@/lib/api";
import type { DownloadItem } from "@/lib/download";

export type Part = { url: string; checked: boolean };

type AppState = {
  url: string;
  status: string;
  busy: boolean;
  cancelled: boolean;
  parts: Part[];
  results: Record<string, ExtractProgress>;
  downloadDir: string | null;
  downloads: Record<string, DownloadItem>;

  setUrl: (url: string) => void;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
  setCancelled: (cancelled: boolean) => void;
  setParts: (parts: Part[]) => void;
  togglePart: (index: number) => void;
  mergeResult: (p: ExtractProgress) => void;
  setDownloadDir: (dir: string | null) => void;
  mergeDownload: (item: DownloadItem) => void;
  seedDownloads: (items: DownloadItem[]) => void;
  resetExtraction: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  url: "https://fitgirl-repacks.site/grand-theft-auto-v/",
  status: "Waiting for input…",
  busy: false,
  cancelled: false,
  parts: [],
  results: {},
  downloadDir: null,
  downloads: {},

  setUrl: (url) => set({ url }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
  setCancelled: (cancelled) => set({ cancelled }),
  setParts: (parts) => set({ parts }),
  togglePart: (index) =>
    set((s) => ({
      parts: s.parts.map((p, i) => (i === index ? { ...p, checked: !p.checked } : p)),
    })),
  mergeResult: (p) =>
    set((s) => ({ results: { ...s.results, [p.sourceUrl]: p } })),
  setDownloadDir: (downloadDir) => set({ downloadDir }),
  mergeDownload: (item) =>
    set((s) => ({ downloads: { ...s.downloads, [item.id]: item } })),
  seedDownloads: (items) =>
    set({ downloads: Object.fromEntries(items.map((i) => [i.id, i])) }),
  resetExtraction: () => set({ parts: [], results: {} }),
}));
```

- Test `src/store/useAppStore.test.ts` (use `useAppStore.getState()` / `setState`):

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

const reset = () =>
  useAppStore.setState({ parts: [], results: {}, downloads: {} });

describe("useAppStore", () => {
  beforeEach(reset);

  it("togglePart flips one part's checked", () => {
    useAppStore.setState({
      parts: [
        { url: "a", checked: true },
        { url: "b", checked: true },
      ],
    });
    useAppStore.getState().togglePart(1);
    expect(useAppStore.getState().parts).toEqual([
      { url: "a", checked: true },
      { url: "b", checked: false },
    ]);
  });

  it("mergeResult and mergeDownload upsert by key", () => {
    useAppStore.getState().mergeResult({
      index: 0, total: 1, sourceUrl: "s", status: "done", directUrl: "d",
    });
    expect(useAppStore.getState().results.s.directUrl).toBe("d");
    useAppStore.getState().mergeDownload({
      id: "dl1", url: "u", filename: "f", dir: "/d",
      totalBytes: 10, downloadedBytes: 5, status: "downloading", speedBps: 1,
    });
    expect(useAppStore.getState().downloads.dl1.downloadedBytes).toBe(5);
  });

  it("resetExtraction clears parts and results", () => {
    useAppStore.setState({ parts: [{ url: "a", checked: true }] });
    useAppStore.getState().resetExtraction();
    expect(useAppStore.getState().parts).toEqual([]);
  });
});
```

- Verify: `npm test` (store tests pass), `npm run build`. Commit: `feat: add Zustand app store`.

---

### Task 2: Hooks (extraction, downloads, events)

Create `src/hooks/useExtraction.ts` — moves the existing Game orchestration; reads/writes the store, calls `@/lib/api`:

```ts
import { useAppStore } from "@/store/useAppStore";
import { extractLinks, fetchParts, cancelExtraction } from "@/lib/api";
import { failedSourceUrls } from "@/lib/extract";

export function useExtraction() {
  const s = useAppStore;

  async function onFetch() {
    s.getState().setBusy(true);
    s.setState({ parts: [], results: {} });
    s.getState().setStatus("Fetching page…");
    try {
      const res = await fetchParts(s.getState().url.trim());
      if (!res.valid) return s.getState().setStatus("Not an official fitgirl-repacks.site URL.");
      if (res.parts.length === 0) return s.getState().setStatus("No fuckingfast links found on this page.");
      s.getState().setParts(res.parts.map((u) => ({ url: u, checked: true })));
      s.getState().setStatus(`Found ${res.parts.length} parts. Uncheck unwanted, then Extract.`);
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  async function onExtract() {
    const { parts, results } = s.getState();
    const checked = parts.filter((p) => p.checked);
    if (checked.length === 0) return s.getState().setStatus("No parts selected.");
    const pending = checked.filter((p) => results[p.url]?.status !== "done").map((p) => p.url);
    if (pending.length === 0) return s.getState().setStatus("All selected parts already extracted.");
    s.getState().setCancelled(false);
    s.getState().setBusy(true);
    s.getState().setStatus(`Extracting ${pending.length} remaining part(s)…`);
    try {
      await extractLinks(pending);
      s.getState().setStatus(s.getState().cancelled ? "Cancelled." : "Extraction complete.");
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  async function onCancel() {
    s.getState().setCancelled(true);
    s.getState().setStatus("Cancelling…");
    try { await cancelExtraction(); } catch (e) { s.getState().setStatus(`Error: ${String(e)}`); }
  }

  async function onRetryFailed() {
    const failed = failedSourceUrls(s.getState().results);
    if (failed.length === 0) return;
    s.getState().setCancelled(false);
    s.getState().setBusy(true);
    s.getState().setStatus(`Retrying ${failed.length} failed part(s)…`);
    try {
      await extractLinks(failed);
      s.getState().setStatus(s.getState().cancelled ? "Cancelled." : "Retry complete.");
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  return { onFetch, onExtract, onCancel, onRetryFailed };
}
```

Create `src/hooks/useDownloads.ts`:

```ts
import { useAppStore } from "@/store/useAppStore";
import { buildRequests, pickDownloadDir, startDownloads } from "@/lib/download";
import { filenameFromUrl } from "@/lib/format";

export function useDownloads() {
  const s = useAppStore;

  async function ensureDir(): Promise<string | null> {
    const cur = s.getState().downloadDir;
    if (cur) return cur;
    const picked = await pickDownloadDir();
    if (picked) s.getState().setDownloadDir(picked);
    return picked;
  }

  async function onDownloadAll() {
    const reqs = buildRequests(s.getState().results);
    if (reqs.length === 0) return s.getState().setStatus("No resolved links to download yet.");
    const dir = await ensureDir();
    if (!dir) return;
    await startDownloads(reqs, dir);
    s.getState().setStatus(`Queued ${reqs.length} download(s) into ${dir}.`);
  }

  async function onDownloadOne(sourceUrl: string) {
    const direct = s.getState().results[sourceUrl]?.directUrl;
    if (!direct) return;
    const dir = await ensureDir();
    if (!dir) return;
    const filename = filenameFromUrl(sourceUrl);
    await startDownloads([{ url: direct, filename }], dir);
    s.getState().setStatus(`Queued ${filename} into ${dir}.`);
  }

  return { onDownloadAll, onDownloadOne };
}
```

Create `src/hooks/useAppEvents.ts`:

```ts
import { useEffect } from "react";
import { onExtractProgress } from "@/lib/api";
import { listDownloads, onDownloadProgress } from "@/lib/download";
import { useAppStore } from "@/store/useAppStore";

export function useAppEvents() {
  useEffect(() => {
    const { mergeResult, setStatus, mergeDownload, seedDownloads, setCancelled } =
      useAppStore.getState();
    listDownloads().then(seedDownloads);
    const unExtract = onExtractProgress((p) => {
      mergeResult(p);
      if (useAppStore.getState().cancelled) return;
      setStatus(`Part ${p.index + 1}/${p.total}: ${p.status}`);
    });
    const unDownload = onDownloadProgress((item) => mergeDownload(item));
    return () => {
      unExtract.then((f) => f());
      unDownload.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

Verify `npm run build`. Commit: `feat: extraction/downloads/events hooks over the store`.

(Note: keep the friendlier `statusText` mapping — move it into a shared `src/lib/format.ts` export or inline in `useAppEvents`. Keep behaviour identical to current Game.)

---

### Task 3: Presentational components

Create `src/components/UrlBar.tsx`, `PartRow.tsx`, `PartList.tsx`, `ExtractControls.tsx`, `LinksPanel.tsx`. Each reads the store via `useAppStore(selector)` and the hooks. `PartRow` adds the inline download indicator: find a download whose `filename === filenameFromUrl(part.url)`; if present show ``${pct}% · ${status}``.

`PartRow.tsx` (the one with new behaviour):

```tsx
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
    dl && dl.totalBytes > 0 ? Math.floor((dl.downloadedBytes / dl.totalBytes) * 100) : 0;

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
```

Add `.part-dl { @apply text-xs text-muted-foreground; }` to `Game.css`.

`UrlBar`, `PartList`, `ExtractControls`, `LinksPanel` are mechanical extractions of the current `Game.tsx` JSX, each reading store state + hook actions (Extract label = `parts.some(p => results[p.url]?.status === "done") ? "Continue" : "Extract selected"`; Download all disabled on `busy || buildRequests(results).length === 0` with the count). Commit: `feat: split Game into presentational subcomponents`.

---

### Task 4: Thin `Game.tsx`, `Downloads.tsx`, `App.tsx` + adapt tests

- `Game.tsx` becomes:

```tsx
import { useAppStore } from "@/store/useAppStore";
import { UrlBar } from "@/components/UrlBar";
import { PartList } from "@/components/PartList";
import { ExtractControls } from "@/components/ExtractControls";
import { LinksPanel } from "@/components/LinksPanel";
import "./Game.css";

export default function Game() {
  const status = useAppStore((s) => s.status);
  const hasParts = useAppStore((s) => s.parts.length > 0);
  return (
    <main className="game-page">
      <h1 className="game-title">FitGirl Downloader — Extract</h1>
      <UrlBar />
      <p className="status-text">{status}</p>
      {hasParts && (
        <div className="part-list">
          <PartList />
          <ExtractControls />
        </div>
      )}
      <LinksPanel />
    </main>
  );
}
```

- `Downloads.tsx` reads `useAppStore((s) => s.downloads)` (drop its own `useEffect`/subscription — `useAppEvents` owns it). Keep the row rendering + pause/resume/cancel.
- `App.tsx` calls `useAppEvents()` and shows the active-count badge: `Downloads ({active})` where `active = Object.values(downloads).filter(d => ["downloading","queued","paused"].includes(d.status)).length`.
- Adapt `Game.test.tsx`: it currently drives `onExtractProgress` via a captured callback. Since events now flow through `useAppEvents` (mounted in `App`, not `Game`), update the test to render `<App />` (or to call `useAppStore.getState().mergeResult(...)` + `setParts(...)` directly to set up the failed-part state, then assert the Retry button). Prefer the store-driven setup (simpler, no event plumbing).
- Adapt `Downloads.test.tsx`: seed via `useAppStore.setState({ downloads: {} })` and assert the empty state; mock `@/lib/download` as before.
- Add `src/components/PartRow.test.tsx`: set a `downloads` entry whose filename matches a part, render `PartRow`, assert the `% · status` indicator shows.

Verify: `npm test` (all green) + `npm run build`. Commit: `feat: thin Game/Downloads/App over the store; adapt tests`.

---

## Self-Review

- Spec coverage: Zustand store (T1), single event wiring (T2 `useAppEvents`), component split (T3), inline indicator (T3 `PartRow`), tab badge (T4 `App`), behaviour-preserving tests (T1/T4). ✓
- Type consistency: store imports `ExtractProgress`/`DownloadItem` from the libs; `Part` exported from the store and consumed by components; hook actions match the lib signatures. ✓
- No placeholders: all new files have full code except the 4 mechanical extraction components (UrlBar/PartList/ExtractControls/LinksPanel), whose content is a 1:1 move of the current `Game.tsx` JSX into store/hook reads — the controller has that source in hand during inline execution.
