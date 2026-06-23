import "./TagFilter.css";

function TagChip({
  tag,
  active,
  onToggle,
}: {
  tag: string;
  active: boolean;
  onToggle: (tag: string) => void;
}) {
  const handleClick = () => onToggle(tag);
  const className = active ? "tag-chip tag-chip--active" : "tag-chip";
  return (
    <button className={className} onClick={handleClick}>
      {tag}
    </button>
  );
}

export function TagFilter({
  tags,
  selected,
  onToggle,
}: {
  tags: string[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-filter">
      {tags.map((tag) => (
        <TagChip
          key={tag}
          tag={tag}
          active={selected.has(tag)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
