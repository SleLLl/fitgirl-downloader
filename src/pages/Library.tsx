import { LibraryCard } from "@/components/LibraryCard";
import { useLibrary } from "@/hooks/useLibrary";
import "./Library.css";

export default function Library() {
  const { data, isLoading, error } = useLibrary();
  const games = data ?? [];

  return (
    <div className="library-page">
      <div className="library-header">
        <h2 className="library-title">Library ({games.length})</h2>
        {isLoading && <span className="library-loading">Loading…</span>}
      </div>
      {error && <p className="library-error">{String(error)}</p>}
      {!isLoading && !error && games.length === 0 && (
        <p className="library-empty">
          No completed downloads yet. Finished downloads show up here grouped by
          game.
        </p>
      )}
      <div className="library-list">
        {games.map((game) => (
          <LibraryCard key={`${game.dir}:${game.name}`} game={game} />
        ))}
      </div>
    </div>
  );
}
