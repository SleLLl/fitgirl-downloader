import { create } from "zustand";
import type { ExtractProgress } from "@/lib/api";
import type { DownloadItem } from "@/lib/download";
import type { Settings } from "@/lib/settings";

export type Part = { url: string; checked: boolean };
export type Tab = "browse" | "extract" | "downloads" | "settings";

type AppState = {
  url: string;
  status: string;
  busy: boolean;
  cancelled: boolean;
  parts: Part[];
  results: Record<string, ExtractProgress>;
  downloadDir: string | null;
  downloads: Record<string, DownloadItem>;
  settings: Settings | null;
  tab: Tab;
  /// Index of the last part toggled without Shift — the range-select anchor.
  selectionAnchor: number | null;

  setTab: (tab: Tab) => void;
  setUrl: (url: string) => void;
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
  setDownloadDir: (dir: string | null) => void;
  mergeDownload: (item: DownloadItem) => void;
  seedDownloads: (items: DownloadItem[]) => void;
  setSettings: (settings: Settings) => void;
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
  settings: null,
  tab: "browse",
  selectionAnchor: null,

  setTab: (tab) => set({ tab }),
  setUrl: (url) => set({ url }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
  setCancelled: (cancelled) => set({ cancelled }),
  setParts: (parts) => set({ parts, selectionAnchor: null }),
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
    set((s) => ({ results: { ...s.results, [p.sourceUrl]: p } })),
  setDownloadDir: (downloadDir) => set({ downloadDir }),
  mergeDownload: (item) =>
    set((s) => ({ downloads: { ...s.downloads, [item.id]: item } })),
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
  resetExtraction: () => set({ parts: [], results: {} }),
}));
