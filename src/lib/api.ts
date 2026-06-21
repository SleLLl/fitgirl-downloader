import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type FetchResult = { valid: boolean; parts: string[] };

export type ExtractStatus =
  | "processing"
  | "needs_captcha"
  | "done"
  | "failed"
  | "cancelled";

export type ExtractProgress = {
  index: number;
  total: number;
  sourceUrl: string;
  status: ExtractStatus;
  directUrl: string | null;
};

export function fetchParts(url: string): Promise<FetchResult> {
  return invoke<FetchResult>("fetch_parts", { url });
}

export function extractLinks(urls: string[]): Promise<string[]> {
  return invoke<string[]>("extract_links", { urls });
}

export function onExtractProgress(
  cb: (p: ExtractProgress) => void
): Promise<UnlistenFn> {
  return listen<ExtractProgress>("extract-progress", (e) => cb(e.payload));
}

export function cancelExtraction(): Promise<void> {
  return invoke<void>("cancel_extraction");
}
