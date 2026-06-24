import { extractLinks } from "@/lib/api";
import { useAppStore, type GameJob } from "@/store/useAppStore";

// Single in-flight runner: the extractor uses one WebView, so games extract one
// at a time. Module-level so concurrent enqueue calls share the same loop.
let running = false;

/// Submit a game for "extract links + download" and drain the queue one game at
/// a time. The job persists (status queued → extracting → done) so its card and
/// file list stay on the Downloads page; resolved links auto-queue as downloads
/// via the global progress listener (which reads the extracting job).
export async function enqueueGame(job: Omit<GameJob, "status">): Promise<void> {
  useAppStore.getState().enqueueJob({ ...job, status: "queued" });
  if (running) return;
  running = true;
  try {
    while (true) {
      const next = useAppStore
        .getState()
        .gameJobs.find((j) => j.status === "queued");
      if (!next) break;
      useAppStore.getState().setJobStatus(next.url, "extracting");
      try {
        await extractLinks(next.partUrls);
      } catch {
        // Extraction failed/cancelled — any links already resolved stay queued;
        // move on rather than blocking the queue.
      }
      useAppStore.getState().setJobStatus(next.url, "done");
    }
  } finally {
    running = false;
  }
}
