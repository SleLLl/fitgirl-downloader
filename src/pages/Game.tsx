import { useEffect } from "react";
import { UrlBar } from "@/components/UrlBar";
import { DownloadPanel } from "@/components/DownloadPanel";
import { useAppStore } from "@/store/useAppStore";
import "./Game.css";

export default function Game() {
  const setGame = useAppStore((s) => s.setGame);

  // Manual downloads have no game context — clear it so the Library falls back
  // to the filename heuristic. (The auto-queue listener only fires for parts of
  // the active game job, so manual extraction here never auto-queues.)
  useEffect(() => {
    setGame("", "");
  }, [setGame]);

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
