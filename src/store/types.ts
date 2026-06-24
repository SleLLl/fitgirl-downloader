import type { ExtractProgress } from "@/lib/api";
import type { ExtractionSlice } from "./slices/extractionSlice";
import type { QueueSlice } from "./slices/queueSlice";
import type { DownloadsSlice } from "./slices/downloadsSlice";
import type { SettingsSlice } from "./slices/settingsSlice";

export type Part = { url: string; checked: boolean };

export type JobStatus = "queued" | "extracting" | "done";

/// A game submitted for "extract links + download": the selected part page URLs
/// and the metadata for its download jobs. Persists for the lifetime of the
/// game's card on the Downloads page (so the full file list stays visible),
/// regardless of extraction progress. One game extracts at a time (single
/// WebView); the rest stay `queued`.
export type GameJob = {
  url: string;
  gameTitle: string;
  gameCover: string;
  partUrls: string[];
  status: JobStatus;
};

/// Cached extraction state for one game URL (session-scoped; survives navigation,
/// cleared on app restart or via Settings → Clear link cache).
export type CacheEntry = {
  parts: Part[];
  results: Record<string, ExtractProgress>;
};

export type Theme = "dark" | "light";

/// The full store: the union of every feature slice. Slice creators are typed
/// against this so they can read across slices via `set((s) => …)` / `get()`.
export type AppStore = ExtractionSlice &
  QueueSlice &
  DownloadsSlice &
  SettingsSlice;
