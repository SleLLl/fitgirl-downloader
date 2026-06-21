import { useAppStore } from "@/store/useAppStore";
import { PartRow } from "./PartRow";

export function PartList() {
  const parts = useAppStore((s) => s.parts);
  return (
    <div className="part-scroll">
      {parts.map((p, i) => (
        <PartRow key={p.url} part={p} index={i} />
      ))}
    </div>
  );
}
