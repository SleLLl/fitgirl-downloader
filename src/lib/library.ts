import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { removeDownload } from "@/lib/download";

export type LibraryGame = {
  name: string;
  dir: string;
  parts: number;
  totalBytes: number;
  coverUrl: string;
  samplePath: string;
  ids: string[];
};

export function libraryGames(): Promise<LibraryGame[]> {
  return invoke<LibraryGame[]>("library_games");
}

/// Open the file manager with the game's files revealed (selected).
export function revealGame(game: LibraryGame): Promise<void> {
  return revealItemInDir(game.samplePath);
}

/// Remove a game from the library: drop its download records. Files on disk are
/// left untouched.
export function removeLibraryGame(game: LibraryGame): Promise<void> {
  return Promise.all(game.ids.map((id) => removeDownload(id))).then(() => {});
}
