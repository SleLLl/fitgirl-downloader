import { useAppStore } from "@/store/useAppStore";
import { buildRequests, pickDownloadDir, startDownloads } from "@/lib/download";
import { setSetting } from "@/lib/settings";
import { filenameFromUrl } from "@/lib/format";

/// Download orchestration over the store. The download folder is asked once per
/// session (B2 will persist it).
export function useDownloads() {
  const s = useAppStore;

  async function ensureDir(): Promise<string | null> {
    const cur = s.getState().downloadDir;
    if (cur) return cur;
    const picked = await pickDownloadDir();
    if (picked) {
      s.getState().setDownloadDir(picked);
      void setSetting("download_dir", picked);
    }
    return picked;
  }

  function gameMeta() {
    const { gameTitle, gameCover } = s.getState();
    return { gameTitle, gameCover };
  }

  async function onDownloadAll() {
    const meta = gameMeta();
    const reqs = buildRequests(s.getState().results).map((r) => ({
      ...r,
      ...meta,
    }));
    if (reqs.length === 0) {
      s.getState().setStatus("No resolved links to download yet.");
      return;
    }
    const dir = await ensureDir();
    if (!dir) return;
    await startDownloads(reqs, dir);
    s.getState().setStatus(`Queued ${reqs.length} download(s) into ${dir}.`);
  }

  async function onDownloadOne(sourceUrl: string) {
    const direct = s.getState().results[sourceUrl]?.directUrl;
    if (!direct) return;
    const dir = await ensureDir();
    if (!dir) return;
    const filename = filenameFromUrl(sourceUrl);
    await startDownloads([{ url: direct, filename, ...gameMeta() }], dir);
    s.getState().setStatus(`Queued ${filename} into ${dir}.`);
  }

  return { onDownloadAll, onDownloadOne };
}
