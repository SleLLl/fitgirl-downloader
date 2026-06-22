import { invoke } from "@tauri-apps/api/core";

export type Repack = { title: string; pageUrl: string; coverUrl: string };

export type InfoField = { label: string; value: string };

export type GameDetails = {
  title: string;
  pageUrl: string;
  coverUrl: string;
  info: InfoField[];
  screenshots: string[];
};

export function scrapePopular(): Promise<Repack[]> {
  return invoke<Repack[]>("scrape_popular");
}

export function searchRepacks(query: string): Promise<Repack[]> {
  return invoke<Repack[]>("search_repacks", { query });
}

export function scrapeGame(url: string): Promise<GameDetails> {
  return invoke<GameDetails>("scrape_game", { url });
}

/// `https://fitgirl-repacks.site/<slug>/` → `<slug>` and back.
export function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
}

export function gameUrlFromSlug(slug: string): string {
  return `https://fitgirl-repacks.site/${slug}/`;
}
