import { useEffect } from "react";
import { onExtractProgress } from "@/lib/api";
import { listDownloads, onDownloadProgress } from "@/lib/download";
import { getSettings } from "@/lib/settings";
import { statusText } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

/// Registers the app's Tauri event subscriptions exactly once (mounted in App),
/// funnelling extraction + download progress into the store. Seeds the current
/// download list on mount.
export function useAppEvents() {
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
      if (useAppStore.getState().cancelled) return;
      setStatus(`Part ${p.index + 1}/${p.total}: ${statusText(p.status)}`);
    });
    const unDownload = onDownloadProgress((item) => mergeDownload(item));
    return () => {
      unExtract.then((f) => f());
      unDownload.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
