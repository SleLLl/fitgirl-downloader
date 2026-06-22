import { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { setSetting } from "@/lib/settings";
import { pickDownloadDir } from "@/lib/download";
import "./SettingsPanel.css";

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const downloadDir = useAppStore((s) => s.downloadDir);
  const setDownloadDir = useAppStore((s) => s.setDownloadDir);

  async function chooseFolder() {
    const picked = await pickDownloadDir();
    if (picked) {
      setDownloadDir(picked);
      void setSetting("download_dir", picked);
    }
  }

  function update(key: "file_concurrency" | "segments", value: number) {
    if (!settings || Number.isNaN(value)) return;
    const next =
      key === "file_concurrency"
        ? { ...settings, fileConcurrency: value }
        : { ...settings, segments: value };
    setSettings(next);
    void setSetting(key, String(value));
  }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) =>
    update("file_concurrency", Number(event.target.value));
  const handleSegmentsChange = (event: ChangeEvent<HTMLInputElement>) =>
    update("segments", Number(event.target.value));

  return (
    <div className="settings-panel">
      <div className="settings-row">
        <span className="settings-label">Download folder</span>
        <span className="settings-value">{downloadDir ?? "(not set)"}</span>
        <Button variant="secondary" onClick={chooseFolder}>
          Choose…
        </Button>
      </div>
      {settings && (
        <>
          <div className="settings-row">
            <span className="settings-label">Parallel files</span>
            <input
              type="number"
              min={1}
              max={8}
              value={settings.fileConcurrency}
              onChange={handleFilesChange}
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
              onChange={handleSegmentsChange}
              className="settings-input"
            />
          </div>
        </>
      )}
    </div>
  );
}
