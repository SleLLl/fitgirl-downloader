import { useEffect } from "react";
import { UrlBar } from "@/components/UrlBar";
import { DownloadPanel } from "@/components/DownloadPanel";
import { useAppStore } from "@/store/useAppStore";
import "./Game.css";

export default function Game() {
  const setGame = useAppStore((s) => s.setGame);
  const setAutoDownload = useAppStore((s) => s.setAutoDownload);

  // Manual downloads have no game context — clear it so the Library falls back
  // to the filename heuristic, and disarm auto-download so manual extraction
  // does not queue links on its own.
  useEffect(() => {
    setGame("", "");
    setAutoDownload(null);
  }, [setGame, setAutoDownload]);

  return (
    <main className="game-page">
      <h2 className="game-title">Add by link</h2>
      <p className="game-hint">
        Paste a fitgirl-repacks.site game URL to fetch its parts.
      </p>
      <UrlBar />
      <DownloadPanel />
    </main>
  );
}
