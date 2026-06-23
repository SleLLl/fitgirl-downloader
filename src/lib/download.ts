import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ExtractProgress } from "./api";
import { filenameFromUrl } from "./format";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export type DownloadItem = {
  id: string;
  url: string;
  filename: string;
  dir: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  speedBps: number;
};

export type DownloadRequest = { url: string; filename: string };

/// Pair each resolved direct URL with its source filename (from the `#...`
/// fragment of the original fuckingfast link).
export function buildRequests(
  results: Record<string, ExtractProgress>
): DownloadRequest[] {
  return Object.values(results)
    .filter((p) => !!p.directUrl)
    .map((p) => ({
      url: p.directUrl as string,
      filename: filenameFromUrl(p.sourceUrl),
    }));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

/// Join a directory and filename using the directory's own path separator
/// (matches how the Rust side builds the on-disk path).
function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const base = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  return `${base}${sep}${name}`;
}

/// Reveal a completed download in the OS file manager (file selected).
export function revealDownload(item: DownloadItem): Promise<void> {
  return revealItemInDir(joinPath(item.dir, item.filename));
}

export function pickDownloadDir(): Promise<string | null> {
  return open({ directory: true }).then((d) =>
    typeof d === "string" ? d : null
  );
}

export function startDownloads(
  items: DownloadRequest[],
  dir: string
): Promise<DownloadItem[]> {
  return invoke<DownloadItem[]>("start_downloads", { items, dir });
}

export function pauseDownload(id: string): Promise<void> {
  return invoke<void>("pause_download", { id });
}

export function resumeDownload(id: string): Promise<void> {
  return invoke<void>("resume_download", { id });
}

export function cancelDownload(id: string): Promise<void> {
  return invoke<void>("cancel_download", { id });
}

export function removeDownload(id: string): Promise<void> {
  return invoke<void>("remove_download", { id });
}

export function clearFinished(): Promise<void> {
  return invoke<void>("clear_finished");
}

export function listDownloads(): Promise<DownloadItem[]> {
  return invoke<DownloadItem[]>("list_downloads");
}

export function onDownloadProgress(
  cb: (item: DownloadItem) => void
): Promise<UnlistenFn> {
  return listen<DownloadItem>("download-progress", (e) => cb(e.payload));
}
