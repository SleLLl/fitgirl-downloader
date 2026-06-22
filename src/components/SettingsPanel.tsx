import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { setSetting } from "@/lib/settings";
import { checkForUpdates } from "@/lib/updater";

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const downloadDir = useAppStore((s) => s.downloadDir);
  const [updateStatus, setUpdateStatus] = useState("");
  const [checking, setChecking] = useState(false);

  async function onCheckUpdates() {
    setChecking(true);
    setUpdateStatus("Checking…");
    try {
      setUpdateStatus(await checkForUpdates());
    } catch (e) {
      setUpdateStatus(`Update check failed: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  }

  if (!settings) return null;

  function update(key: "file_concurrency" | "segments", value: number) {
    if (!settings || Number.isNaN(value)) return;
    const next =
      key === "file_concurrency"
        ? { ...settings, fileConcurrency: value }
        : { ...settings, segments: value };
    setSettings(next);
    void setSetting(key, String(value));
  }

  return (
    <div className="settings-panel">
      <div className="settings-row">
        <span className="settings-label">Folder</span>
        <span className="settings-value">{downloadDir ?? "(not set)"}</span>
      </div>
      <div className="settings-row">
        <span className="settings-label">Parallel files</span>
        <input
          type="number"
          min={1}
          max={8}
          value={settings.fileConcurrency}
          onChange={(e) => update("file_concurrency", Number(e.target.value))}
          className="settings-input"
        />
        <span className="settings-note">(applies after restart)</span>
      </div>
      <div className="settings-row">
        <span className="settings-label">Segments / file</span>
        <input
          type="number"
          min={1}
          max={16}
          value={settings.segments}
          onChange={(e) => update("segments", Number(e.target.value))}
          className="settings-input"
        />
      </div>
      <div className="settings-row">
        <span className="settings-label">Updates</span>
        <Button variant="secondary" onClick={onCheckUpdates} disabled={checking}>
          Check for updates
        </Button>
        {updateStatus && <span className="settings-note">{updateStatus}</span>}
      </div>
    </div>
  );
}
