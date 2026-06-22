import { invoke } from "@tauri-apps/api/core";

export type Repack = { title: string; pageUrl: string; coverUrl: string };

export function scrapePopular(): Promise<Repack[]> {
  return invoke<Repack[]>("scrape_popular");
}
