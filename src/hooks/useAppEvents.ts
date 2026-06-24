import { useEffect } from "react";
import { onExtractProgress } from "@/lib/api";
import { listDownloads, onDownloadProgress } from "@/lib/download";
import { getSettings } from "@/lib/settings";
import { statusText } from "@/lib/format";
import { notifyDownloadDone } from "@/lib/notify";
import { useDownloads } from "@/hooks/useDownloads";
import { useAppStore } from "@/store/useAppStore";

/// Registers the app's Tauri event subscriptions exactly once (mounted in the
/// root Layout),
/// funnelling extraction + download progress into the store. Seeds the current
/// download list on mount.
export function useAppEvents() {
  const { queuePart } = useDownloads();
  useEffect(() => {
    const {
      mergeResult,
      setStatus,
      mergeDownload,
      seedDownloads,
      setSettings,
      setDownloadDir,
    } = useAppStore.getState();
    listDownloads().then(seedDownloads);
    getSettings().then((s) => {
      setSettings(s);
      if (s.downloadDir) setDownloadDir(s.downloadDir);
    });
    const unExtract = onExtractProgress((p) => {
      mergeResult(p);
      // Auto-queue each link as it resolves for the game currently extracting.
      const st = useAppStore.getState();
      const active = st.gameJobs.find((j) => j.status === "extracting");
      if (
        active &&
        st.downloadDir &&
        p.status === "done" &&
        p.directUrl &&
        active.partUrls.includes(p.sourceUrl)
      ) {
        queuePart(p, st.downloadDir, {
          gameTitle: active.gameTitle,
          gameCover: active.gameCover,
        });
      }
      if (st.cancelled) return;
      setStatus(`Part ${p.index + 1}/${p.total}: ${statusText(p.status)}`);
    });
    const unDownload = onDownloadProgress((item) => {
      const prev = useAppStore.getState().downloads[item.id]?.status;
      mergeDownload(item);
      if (item.status === "done" && prev !== "done") {
        void notifyDownloadDone(item.filename);
      }
    });
    return () => {
      unExtract.then((f) => f());
      unDownload.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
