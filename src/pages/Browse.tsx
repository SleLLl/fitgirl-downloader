import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RepackCard } from "@/components/RepackCard";
import { usePopular } from "@/hooks/usePopular";
import { useSearch } from "@/hooks/useSearch";
import { useDebounced } from "@/hooks/useDebounced";
import { type Repack } from "@/lib/showcase";
import "./Browse.css";

export default function Browse({
  onSelect,
}: {
  onSelect: (repack: Repack) => void;
}) {
  const [input, setInput] = useState("");
  const query = useDebounced(input.trim(), 400);
  const searching = query.length >= 2;

  const popular = usePopular();
  const search = useSearch(query);
  const active = searching ? search : popular;
  const repacks = active.data ?? [];
  const heading = searching ? `Results for “${query}”` : "Popular repacks";

  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    setInput(event.target.value);
  const handleRetry = () => active.refetch();

  return (
    <div className="browse-page">
      <Input
        className="browse-search"
        value={input}
        onChange={handleChange}
        placeholder="Search the FitGirl catalog…"
      />
      <div className="browse-header">
        <h2 className="browse-title">
          {heading} ({repacks.length})
        </h2>
        {active.isLoading && <span className="browse-loading">Loading…</span>}
      </div>
      {active.error && (
        <p className="browse-error">
          {String(active.error)}{" "}
          <Button variant="secondary" onClick={handleRetry}>
            Retry
          </Button>
        </p>
      )}
      <div className="repack-grid">
        {repacks.map((repack) => (
          <RepackCard key={repack.pageUrl} repack={repack} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
