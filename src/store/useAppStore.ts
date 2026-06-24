import { create } from "zustand";
import type { ExtractProgress } from "@/lib/api";
import type { DownloadItem } from "@/lib/download";
import type { Settings } from "@/lib/settings";

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

function initialTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

type AppState = {
  url: string;
  /// Game context for the active extraction (empty on the manual "Add by link"
  /// page); attached to download jobs so the Library can group by real game.
  gameTitle: string;
  gameCover: string;
  status: string;
  busy: boolean;
  cancelled: boolean;
  parts: Part[];
  results: Record<string, ExtractProgress>;
  /// Resolved extraction state per game URL, reused across navigation.
  extractionCache: Record<string, CacheEntry>;
  /// Submitted games (queued / extracting / done), in submission order. Each
  /// keeps its full selected-file list so its Downloads card never loses rows.
  gameJobs: GameJob[];
  downloadDir: string | null;
  downloads: Record<string, DownloadItem>;
  settings: Settings | null;
  theme: Theme;
  /// Index of the last part toggled without Shift — the range-select anchor.
  selectionAnchor: number | null;

  setUrl: (url: string) => void;
  setGame: (title: string, cover: string) => void;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
  setCancelled: (cancelled: boolean) => void;
  setParts: (parts: Part[]) => void;
  togglePart: (index: number) => void;
  /// Check or uncheck every part (Select all / none).
  setAllChecked: (checked: boolean) => void;
  /// Gmail-style select: a plain click toggles `index` and sets the anchor; with
  /// `extend` (Shift) every part between the anchor and `index` takes the
  /// anchor's checked state.
  selectPart: (index: number, extend: boolean) => void;
  mergeResult: (p: ExtractProgress) => void;
  /// Replace the active parts+results (used to hydrate from the cache).
  loadExtraction: (parts: Part[], results: Record<string, ExtractProgress>) => void;
  /// Append a game (status `queued`); ignored if its URL is already present.
  enqueueJob: (job: GameJob) => void;
  setJobStatus: (url: string, status: JobStatus) => void;
  removeJob: (url: string) => void;
  clearExtractionCache: () => void;
  setDownloadDir: (dir: string | null) => void;
  mergeDownload: (item: DownloadItem) => void;
  dropDownload: (id: string) => void;
  dropFinished: () => void;
  seedDownloads: (items: DownloadItem[]) => void;
  setSettings: (settings: Settings) => void;
  setTheme: (theme: Theme) => void;
  resetExtraction: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  url: "https://fitgirl-repacks.site/grand-theft-auto-v/",
  gameTitle: "",
  gameCover: "",
  status: "Waiting for input…",
  busy: false,
  cancelled: false,
  parts: [],
  results: {},
  extractionCache: {},
  gameJobs: [],
  downloadDir: null,
  downloads: {},
  settings: null,
  theme: initialTheme(),
  selectionAnchor: null,

  setUrl: (url) => set({ url }),
  setGame: (gameTitle, gameCover) => set({ gameTitle, gameCover }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
  setCancelled: (cancelled) => set({ cancelled }),
  setParts: (parts) =>
    set((s) => ({
      parts,
      selectionAnchor: null,
      extractionCache: {
        ...s.extractionCache,
        [s.gameJobs.find((j) => j.status === "extracting")?.url ?? s.url]: {
          parts,
          results: {},
        },
      },
    })),
  togglePart: (index) =>
    set((s) => ({
      parts: s.parts.map((p, i) =>
        i === index ? { ...p, checked: !p.checked } : p
      ),
    })),
  setAllChecked: (checked) =>
    set((s) => ({ parts: s.parts.map((p) => ({ ...p, checked })) })),
  selectPart: (index, extend) =>
    set((s) => {
      const anchor = s.selectionAnchor;
      if (extend && anchor !== null && s.parts[anchor]) {
        const target = s.parts[anchor].checked;
        const lo = Math.min(anchor, index);
        const hi = Math.max(anchor, index);
        return {
          parts: s.parts.map((p, i) =>
            i >= lo && i <= hi ? { ...p, checked: target } : p
          ),
        };
      }
      return {
        parts: s.parts.map((p, i) =>
          i === index ? { ...p, checked: !p.checked } : p
        ),
        selectionAnchor: index,
      };
    }),
  mergeResult: (p) =>
    set((s) => {
      const results = { ...s.results, [p.sourceUrl]: p };
      const key =
        s.gameJobs.find((j) => j.status === "extracting")?.url ?? s.url;
      const cached = s.extractionCache[key];
      if (!cached) return { results };
      // Accumulate into the cache independently of the active results (which a
      // navigation may have reset), so the cache never loses resolved links.
      return {
        results,
        extractionCache: {
          ...s.extractionCache,
          [key]: {
            parts: cached.parts,
            results: { ...cached.results, [p.sourceUrl]: p },
          },
        },
      };
    }),
  loadExtraction: (parts, results) => set({ parts, results, selectionAnchor: null }),
  enqueueJob: (job) =>
    set((s) =>
      s.gameJobs.some((j) => j.url === job.url)
        ? s
        : { gameJobs: [...s.gameJobs, job] }
    ),
  setJobStatus: (url, status) =>
    set((s) => ({
      gameJobs: s.gameJobs.map((j) => (j.url === url ? { ...j, status } : j)),
    })),
  removeJob: (url) =>
    set((s) => ({ gameJobs: s.gameJobs.filter((j) => j.url !== url) })),
  clearExtractionCache: () => set({ extractionCache: {} }),
  setDownloadDir: (downloadDir) => set({ downloadDir }),
  mergeDownload: (item) =>
    set((s) => ({ downloads: { ...s.downloads, [item.id]: item } })),
  dropDownload: (id) =>
    set((s) => {
      const downloads = { ...s.downloads };
      delete downloads[id];
      return { downloads };
    }),
  dropFinished: () =>
    set((s) => ({
      downloads: Object.fromEntries(
        Object.entries(s.downloads).filter(
          ([, item]) => !["done", "failed", "cancelled"].includes(item.status)
        )
      ),
    })),
  // Merge, not replace: a live progress event that arrived before this seed
  // resolved must not be clobbered by the older snapshot.
  seedDownloads: (items) =>
    set((s) => ({
      downloads: {
        ...Object.fromEntries(items.map((i) => [i.id, i])),
        ...s.downloads,
      },
    })),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    set({ theme });
  },
  resetExtraction: () => set({ parts: [], results: {} }),
}));
