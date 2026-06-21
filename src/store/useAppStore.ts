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
      parts: s.parts.map((p, i) =>
        i === index ? { ...p, checked: !p.checked } : p
      ),
    })),
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
  resetExtraction: () => set({ parts: [], results: {} }),
}));
