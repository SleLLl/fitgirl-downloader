# Plan B1.5 — Frontend State & Component Refactor — Design Spec

**Date:** 2026-06-21
**Status:** Approved (autonomous — user requested this refactor; decisions documented here)
**Builds on:** B1 (download engine & dashboard), merged to `master`.

## Goal

Tame the grown `Game.tsx` by (1) introducing a Zustand store as the single source
of truth for shared UI state, (2) splitting `Game.tsx` into focused subcomponents,
and (3) showing per-part download progress inline (no need to switch to the
Downloads tab) plus an active-count badge on the Downloads tab.

## Motivation

`Game.tsx` is ~270 lines mixing URL input, the part checklist, extraction
controls, the links panel, and all the async orchestration. Two pages
(`Game`, `Downloads`) each subscribe to events independently. Download state is
local to `Downloads.tsx`, so the Extract tab can't reflect a download's progress.

## Decisions

- **State manager: Zustand** — minimal, hook-based, no provider boilerplate; fits
  Tauri/React. One store, no slicing libraries (YAGNI).
- **Event subscriptions move to ONE place** (a top-level init effect in `App`),
  writing into the store. The `onExtractProgress` and `onDownloadProgress`
  listeners are registered exactly once for the app's lifetime.
- **Behaviour is preserved** — the existing `Game.test.tsx` and `Downloads.test.tsx`
  must keep passing (adapted only for the store), proving no regression.
- **Per-part download indicator:** a part row finds its matching download in the
  store by `filename === filenameFromUrl(sourceUrl)` and renders that item's
  percent + status inline once a download exists for it.

## Architecture

### Store — `src/store/useAppStore.ts`

State:
- `url: string`, `status: string`, `busy: boolean`
- `parts: Part[]` (`{ url, checked }`), `results: Record<string, ExtractProgress>`
- `downloadDir: string | null`
- `downloads: Record<string, DownloadItem>`
- `cancelled: boolean` (replaces the old `cancelledRef`)

Plain setters/mutators (synchronous, pure state):
- `setUrl`, `setStatus`, `setBusy`, `setParts`, `togglePart(index)`,
  `mergeResult(p: ExtractProgress)`, `setDownloadDir`, `mergeDownload(item)`,
  `setCancelled(b)`, `resetExtraction()`.

Async orchestration stays in a thin hook layer, not the store (keeps the store a
pure state container and keeps Tauri calls mockable):
- `src/hooks/useExtraction.ts` — `onFetch`, `onExtract`, `onCancel`,
  `onRetryFailed` (read/write the store, call `@/lib/api`).
- `src/hooks/useDownloads.ts` — `ensureDir`, `onDownloadAll`, `onDownloadOne`
  (read/write the store, call `@/lib/download`).

### Global event wiring — `src/hooks/useAppEvents.ts`

A single effect (mounted once in `App`) that subscribes to `onExtractProgress`
→ `mergeResult` and `onDownloadProgress` → `mergeDownload`, and on mount calls
`listDownloads()` to seed `downloads`. Returns nothing; runs for the app lifetime.

### Components

- `src/components/UrlBar.tsx` — URL `Input` + "Fetch links" `Button`.
- `src/components/PartList.tsx` — the scrollable checklist; renders `PartRow`.
- `src/components/PartRow.tsx` — checkbox, filename, extraction status, per-part
  "Download" button, and the **inline download progress** (percent + status) when
  a matching download exists.
- `src/components/ExtractControls.tsx` — Extract/Continue, Cancel, Retry failed.
- `src/components/LinksPanel.tsx` — Direct-links textarea, Copy all, Download all (N).
- `src/pages/Game.tsx` — thin container: `UrlBar` + status line + `PartList` +
  `ExtractControls` + `LinksPanel`, all reading the store / hooks.
- `src/pages/Downloads.tsx` — reads `store.downloads` (no own subscription).
- `src/App.tsx` — calls `useAppEvents()`; Downloads tab label shows an active
  count badge (`downloading|queued|paused`).

## Data Flow

`App` mounts → `useAppEvents` subscribes once + seeds downloads. User actions call
hook functions → hooks mutate the store + call Tauri. Tauri events arrive → the
single listeners merge into the store → all subscribed components re-render.
Switching tabs only toggles `hidden`; the store persists everything.

## Error Handling

Unchanged from B1 — hook functions keep the same try/catch + status messages.
The store never throws; setters are pure.

## Testing Strategy

- **Store unit tests (vitest):** `togglePart`, `mergeResult`, `mergeDownload`,
  `resetExtraction` mutate state correctly.
- **PartRow test:** given a `downloads` entry whose `filename` matches the part,
  the row shows its percent/status; absent, it doesn't.
- **Adapted page tests:** `Game.test.tsx` (Retry-failed appears after a failed
  result) and `Downloads.test.tsx` (empty state) keep passing against the store
  (mock `@/lib/api` / `@/lib/download` as before; drive store via the same events).
- `npm run build` clean.

## Non-Goals

- No new download/extraction features (pure refactor + the inline indicator).
- No persistence (that's B2). `downloadDir` stays session-only here.
- No routing library — keep the `hidden`-based tab toggle.
