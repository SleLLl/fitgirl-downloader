import { extractLinks } from "@/lib/api";
import { useAppStore, type GameJob } from "@/store/useAppStore";

// Single in-flight runner: the extractor uses one WebView, so games extract one
// at a time. Module-level so concurrent enqueue calls share the same loop.
let running = false;

/// Enqueue a game for "extract links + download" and drain the queue one game at
/// a time. Each job extracts its selected parts; resolved links auto-queue as
/// downloads via the global progress listener (which reads `activeJob`).
export async function enqueueGame(job: GameJob): Promise<void> {
  useAppStore.getState().enqueueJob(job);
  if (running) return;
  running = true;
  try {
    while (true) {
      const current = useAppStore.getState().startNextJob();
      if (!current) break;
      try {
        await extractLinks(current.partUrls);
      } catch {
        // Extraction failed/cancelled — any links already resolved stay queued;
        // move on to the next game rather than blocking the queue.
      }
      useAppStore.getState().finishActiveJob();
    }
  } finally {
    running = false;
  }
}
