import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RepackCard } from "@/components/RepackCard";
import { TagFilter } from "@/components/TagFilter";
import { usePopular } from "@/hooks/usePopular";
import { useSearch } from "@/hooks/useSearch";
import { useDebounced } from "@/hooks/useDebounced";
import { type Repack } from "@/lib/showcase";
import "./Browse.css";

function uniqueTags(repacks: Repack[]): string[] {
  const set = new Set<string>();
  for (const repack of repacks) {
    for (const tag of repack.tags) set.add(tag);
  }
  return [...set].sort();
}

export default function Browse({
  onSelect,
}: {
  onSelect: (repack: Repack) => void;
}) {
  const [input, setInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const query = useDebounced(input.trim(), 400);
  const searching = query.length >= 2;

  const popular = usePopular();
  const search = useSearch(query);
  const active = searching ? search : popular;
  const repacks = active.data ?? [];

  // A new result set has its own tags; drop any selection that no longer fits.
  useEffect(() => setSelectedTags(new Set()), [query]);

  const availableTags = useMemo(() => uniqueTags(repacks), [repacks]);
  const visible = useMemo(
    () =>
      selectedTags.size === 0
        ? repacks
        : repacks.filter((repack) =>
            [...selectedTags].every((tag) => repack.tags.includes(tag))
          ),
    [repacks, selectedTags]
  );
  const heading = searching ? `Results for “${query}”` : "Popular repacks";

  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    setInput(event.target.value);
  const handleRetry = () => active.refetch();
  const handleToggleTag = (tag: string) =>
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

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
          {heading} ({visible.length})
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
      <TagFilter
        tags={availableTags}
        selected={selectedTags}
        onToggle={handleToggleTag}
      />
      <div className="repack-grid">
        {visible.map((repack) => (
          <RepackCard key={repack.pageUrl} repack={repack} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
