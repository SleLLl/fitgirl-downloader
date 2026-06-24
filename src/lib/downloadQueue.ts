import { extractLinks } from "@/lib/api";
import { startDownloads } from "@/lib/download";
import { filenameFromUrl } from "@/lib/format";
import { useAppStore, type GameJob } from "@/store/useAppStore";

// Single in-flight runner: the extractor uses one WebView, so games extract one
// at a time. Module-level so concurrent enqueue calls share the same loop.
let running = false;

/// Queue downloads for parts whose links are already cached, and return the
/// parts that still need extracting. Skips files already downloading.
function queueCachedAndPending(job: GameJob, dir: string): string[] {
  const store = useAppStore.getState();
  const cache = store.extractionCache[job.url];
  const existing = new Set(
    Object.values(store.downloads).map((d) => d.filename)
  );
  const pending: string[] = [];
  for (const url of job.partUrls) {
    const resolved = cache?.results[url]?.directUrl;
    if (!resolved) {
      pending.push(url);
      continue;
    }
    const filename = filenameFromUrl(url);
    if (!existing.has(filename)) {
      existing.add(filename);
      void startDownloads(
        [
          {
            url: resolved,
            filename,
            gameTitle: job.gameTitle,
            gameCover: job.gameCover,
          },
        ],
        dir
      ).then((created) => {
        const merge = useAppStore.getState().mergeDownload;
        created.forEach(merge);
      });
    }
  }
  return pending;
}

/// Submit a game for "extract links + download" and drain the queue one game at
/// a time. Cached links are queued immediately; only unresolved parts are
/// extracted (each auto-queues as it resolves via the global progress listener).
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
      const dir = useAppStore.getState().downloadDir;
      const pending = dir ? queueCachedAndPending(next, dir) : next.partUrls;
      if (pending.length > 0) {
        try {
          await extractLinks(pending);
        } catch {
          // Extraction failed/cancelled — resolved links stay queued; move on.
        }
      }
      useAppStore.getState().setJobStatus(next.url, "done");
    }
  } finally {
    running = false;
  }
}
