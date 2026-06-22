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

export function scrapeGame(url: string): Promise<GameDetails> {
  return invoke<GameDetails>("scrape_game", { url });
}
