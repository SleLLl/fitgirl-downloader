import { UrlBar } from "@/components/UrlBar";
import { DownloadPanel } from "@/components/DownloadPanel";
import "./Game.css";

export default function Game() {
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
