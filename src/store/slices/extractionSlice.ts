import type { StateCreator } from "zustand";
import type { ExtractProgress } from "@/lib/api";
import type { AppStore, CacheEntry, Part } from "../types";

/// Extraction context: the active game URL, its parts/results, the per-game link
/// cache, and selection state.
export type ExtractionSlice = {
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
  /// Which game URL each part page URL belongs to, so a resolved link is always
  /// cached under its own game — even if extractions for different games
  /// interleave or the active URL has since changed.
  partOwner: Record<string, string>;
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
  /// Record which game owns these part URLs (so their links cache correctly).
  setPartOwner: (urls: string[], owner: string) => void;
  clearExtractionCache: () => void;
  resetExtraction: () => void;
};

export const createExtractionSlice: StateCreator<
  AppStore,
  [],
  [],
  ExtractionSlice
> = (set) => ({
  url: "https://fitgirl-repacks.site/grand-theft-auto-v/",
  gameTitle: "",
  gameCover: "",
  status: "Waiting for input…",
  busy: false,
  cancelled: false,
  parts: [],
  results: {},
  extractionCache: {},
  partOwner: {},
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
      // A manual fetch is always for the active URL: that game owns these parts.
      partOwner: {
        ...s.partOwner,
        ...Object.fromEntries(parts.map((p) => [p.url, s.url])),
      },
      extractionCache: {
        ...s.extractionCache,
        [s.url]: { parts, results: {} },
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
      // Cache under the part's owning game, never a global guess — so a resolved
      // link can't leak into another game's cache.
      const key = s.partOwner[p.sourceUrl] ?? s.url;
      const cached = s.extractionCache[key];
      if (!cached) return { results };
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
  loadExtraction: (parts, results) =>
    set({ parts, results, selectionAnchor: null }),
  setPartOwner: (urls, owner) =>
    set((s) => ({
      partOwner: {
        ...s.partOwner,
        ...Object.fromEntries(urls.map((u) => [u, owner])),
      },
    })),
  clearExtractionCache: () => set({ extractionCache: {} }),
  resetExtraction: () => set({ parts: [], results: {} }),
});
