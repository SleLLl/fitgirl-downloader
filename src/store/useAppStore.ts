import { create } from "zustand";
import { createExtractionSlice } from "./slices/extractionSlice";
import { createQueueSlice } from "./slices/queueSlice";
import { createDownloadsSlice } from "./slices/downloadsSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import type { AppStore } from "./types";

export type {
  AppStore,
  Part,
  JobStatus,
  GameJob,
  CacheEntry,
  Theme,
} from "./types";

/// The app store, assembled from feature slices (extraction, queue, downloads,
/// settings). Each slice lives in `./slices` and is typed against `AppStore`, so
/// it can read across slices via `set((s) => …)` / `get()`.
export const useAppStore = create<AppStore>()((...a) => ({
  ...createExtractionSlice(...a),
  ...createQueueSlice(...a),
  ...createDownloadsSlice(...a),
  ...createSettingsSlice(...a),
}));
