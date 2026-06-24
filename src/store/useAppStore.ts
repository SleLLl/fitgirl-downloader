import { create } from "zustand";
import type { ExtractProgress } from "@/lib/api";
import type { DownloadItem } from "@/lib/download";
import type { Settings } from "@/lib/settings";

export type Part = { url: string; checked: boolean };

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
  /// The game whose resolved links should auto-queue as downloads (set by the
  /// "Get links & download" flow). Carries its own metadata so links keep the
  /// right game even if the user browses to another game mid-extraction. Null
  /// disables auto-download.
  autoDownload: { url: string; gameTitle: string; gameCover: string } | null;
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
  /// Gmail-style select: a plain click toggles `index` and sets the anchor; with
  /// `extend` (Shift) every part between the anchor and `index` takes the
  /// anchor's checked state.
  selectPart: (index: number, extend: boolean) => void;
  mergeResult: (p: ExtractProgress) => void;
  /// Replace the active parts+results (used to hydrate from the cache).
  loadExtraction: (parts: Part[], results: Record<string, ExtractProgress>) => void;
  setAutoDownload: (
    g: { url: string; gameTitle: string; gameCover: string } | null
  ) => void;
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
  autoDownload: null,
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
        [s.autoDownload?.url ?? s.url]: { parts, results: {} },
      },
    })),
  togglePart: (index) =>
    set((s) => ({
      parts: s.parts.map((p, i) =>
        i === index ? { ...p, checked: !p.checked } : p
      ),
    })),
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
      const key = s.autoDownload?.url ?? s.url;
      const cached = s.extractionCache[key];
      return {
        results,
        extractionCache: cached
          ? { ...s.extractionCache, [key]: { ...cached, results } }
          : s.extractionCache,
      };
    }),
  loadExtraction: (parts, results) => set({ parts, results, selectionAnchor: null }),
  setAutoDownload: (autoDownload) => set({ autoDownload }),
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
