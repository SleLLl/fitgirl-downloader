import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export type LibraryGame = {
  name: string;
  dir: string;
  parts: number;
  totalBytes: number;
  coverUrl: string;
  samplePath: string;
};

export function libraryGames(): Promise<LibraryGame[]> {
  return invoke<LibraryGame[]>("library_games");
}

/// Open the file manager with the game's files revealed (selected).
export function revealGame(game: LibraryGame): Promise<void> {
  return revealItemInDir(game.samplePath);
}
