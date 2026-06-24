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
  clearExtractionCache: () => void;
  resetExtraction: () => void;
};

/// The URL the link cache is keyed under: the extracting game if any (so writes
/// land on the right game even after navigation), else the active URL.
function cacheKey(s: AppStore): string {
  return s.gameJobs.find((j) => j.status === "extracting")?.url ?? s.url;
}

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
        [cacheKey(s)]: { parts, results: {} },
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
      const key = cacheKey(s);
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
  loadExtraction: (parts, results) =>
    set({ parts, results, selectionAnchor: null }),
  clearExtractionCache: () => set({ extractionCache: {} }),
  resetExtraction: () => set({ parts: [], results: {} }),
});
