import { useAppStore } from "@/store/useAppStore";
import { PartList } from "@/components/PartList";
import { ExtractControls } from "@/components/ExtractControls";
import { LinksPanel } from "@/components/LinksPanel";

/// The extraction workspace (parts selection, extract controls, resolved links)
/// driven by the active store context. Reused on the game page and the manual
/// "Add by link" page.
export function DownloadPanel() {
  const status = useAppStore((s) => s.status);
  const hasParts = useAppStore((s) => s.parts.length > 0);

  return (
    <div className="download-panel">
      {status && <p className="status-text">{status}</p>}
      {hasParts && (
        <div className="part-list">
          <PartList />
          <ExtractControls />
        </div>
      )}
      <LinksPanel />
    </div>
  );
}
