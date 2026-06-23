import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/download";
import { revealGame, type LibraryGame } from "@/lib/library";

export function LibraryCard({ game }: { game: LibraryGame }) {
  const partsLabel = game.parts === 1 ? "1 file" : `${game.parts} files`;

  const handleOpen = () => {
    void revealGame(game);
  };

  return (
    <div className="library-card">
      <div className="library-info">
        <span className="library-name">{game.name}</span>
        <span className="library-meta">
          {partsLabel} · {formatBytes(game.totalBytes)}
        </span>
        <span className="library-dir">{game.dir}</span>
      </div>
      <Button variant="secondary" onClick={handleOpen}>
        Open folder
      </Button>
    </div>
  );
}
