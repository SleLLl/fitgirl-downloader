import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/download";
import { removeLibraryGame, revealGame, type LibraryGame } from "@/lib/library";

export function LibraryCard({ game }: { game: LibraryGame }) {
  const partsLabel = game.parts === 1 ? "1 file" : `${game.parts} files`;
  const queryClient = useQueryClient();

  const handleOpen = () => {
    void revealGame(game);
  };
  const handleRemove = async () => {
    await removeLibraryGame(game);
    await queryClient.invalidateQueries({ queryKey: ["library"] });
  };

  return (
    <div className="library-card">
      {game.coverUrl && (
        <img
          className="library-cover"
          src={game.coverUrl}
          alt={game.name}
          loading="lazy"
        />
      )}
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
      <Button variant="destructive" onClick={handleRemove}>
        Remove
      </Button>
    </div>
  );
}
