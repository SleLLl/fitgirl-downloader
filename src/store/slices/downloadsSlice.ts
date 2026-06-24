import type { StateCreator } from "zustand";
import type { DownloadItem } from "@/lib/download";
import type { AppStore } from "../types";

const FINISHED_STATUSES = ["done", "failed", "cancelled"];

/// Download jobs mirrored from the backend, plus the chosen download folder.
export type DownloadsSlice = {
  downloadDir: string | null;
  downloads: Record<string, DownloadItem>;
  setDownloadDir: (dir: string | null) => void;
  mergeDownload: (item: DownloadItem) => void;
  dropDownload: (id: string) => void;
  dropFinished: () => void;
  seedDownloads: (items: DownloadItem[]) => void;
};

export const createDownloadsSlice: StateCreator<
  AppStore,
  [],
  [],
  DownloadsSlice
> = (set) => ({
  downloadDir: null,
  downloads: {},
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
          ([, item]) => !FINISHED_STATUSES.includes(item.status)
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
});
