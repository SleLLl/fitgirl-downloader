import type { StateCreator } from "zustand";
import type { AppStore, GameJob, JobStatus } from "../types";

/// The per-game extraction queue (submitted games, one extracting at a time).
export type QueueSlice = {
  /// Submitted games (queued / extracting / done), in submission order. Each
  /// keeps its full selected-file list so its Downloads card never loses rows.
  gameJobs: GameJob[];
  /// Append a game (status `queued`); ignored if its URL is already present.
  enqueueJob: (job: GameJob) => void;
  setJobStatus: (url: string, status: JobStatus) => void;
  removeJob: (url: string) => void;
};

export const createQueueSlice: StateCreator<AppStore, [], [], QueueSlice> = (
  set
) => ({
  gameJobs: [],
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
});
