import { useAppStore } from "@/store/useAppStore";
import { UrlBar } from "@/components/UrlBar";
import { PartList } from "@/components/PartList";
import { ExtractControls } from "@/components/ExtractControls";
import { LinksPanel } from "@/components/LinksPanel";
import "./Game.css";

export default function Game() {
  const status = useAppStore((s) => s.status);
  const hasParts = useAppStore((s) => s.parts.length > 0);

  return (
    <main className="game-page">
      <h1 className="game-title">FitGirl Downloader — Extract</h1>
      <UrlBar />
      <p className="status-text">{status}</p>
      {hasParts && (
        <div className="part-list">
          <PartList />
          <ExtractControls />
        </div>
      )}
      <LinksPanel />
    </main>
  );
}
