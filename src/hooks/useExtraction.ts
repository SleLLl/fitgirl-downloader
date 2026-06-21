import { useAppStore } from "@/store/useAppStore";
import { cancelExtraction, extractLinks, fetchParts } from "@/lib/api";
import { failedSourceUrls } from "@/lib/extract";

/// Extraction orchestration over the store (keeps the store a pure state
/// container and keeps the Tauri calls in one mockable place).
export function useExtraction() {
  const s = useAppStore;

  async function onFetch() {
    s.getState().setBusy(true);
    s.setState({ parts: [], results: {} });
    s.getState().setStatus("Fetching page…");
    try {
      const res = await fetchParts(s.getState().url.trim());
      if (!res.valid) {
        s.getState().setStatus("Not an official fitgirl-repacks.site URL.");
        return;
      }
      if (res.parts.length === 0) {
        s.getState().setStatus("No fuckingfast links found on this page.");
        return;
      }
      s.getState().setParts(res.parts.map((u) => ({ url: u, checked: true })));
      s.getState().setStatus(
        `Found ${res.parts.length} parts. Uncheck unwanted, then Extract.`
      );
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  async function onExtract() {
    const { parts, results } = s.getState();
    const checked = parts.filter((p) => p.checked);
    if (checked.length === 0) {
      s.getState().setStatus("No parts selected.");
      return;
    }
    const pending = checked
      .filter((p) => results[p.url]?.status !== "done")
      .map((p) => p.url);
    if (pending.length === 0) {
      s.getState().setStatus("All selected parts already extracted.");
      return;
    }
    s.getState().setCancelled(false);
    s.getState().setBusy(true);
    s.getState().setStatus(`Extracting ${pending.length} remaining part(s)…`);
    try {
      await extractLinks(pending);
      s.getState().setStatus(
        s.getState().cancelled ? "Cancelled." : "Extraction complete."
      );
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  async function onCancel() {
    s.getState().setCancelled(true);
    s.getState().setStatus("Cancelling…");
    try {
      await cancelExtraction();
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    }
  }

  async function onRetryFailed() {
    const failed = failedSourceUrls(s.getState().results);
    if (failed.length === 0) return;
    s.getState().setCancelled(false);
    s.getState().setBusy(true);
    s.getState().setStatus(`Retrying ${failed.length} failed part(s)…`);
    try {
      await extractLinks(failed);
      s.getState().setStatus(
        s.getState().cancelled ? "Cancelled." : "Retry complete."
      );
    } catch (e) {
      s.getState().setStatus(`Error: ${String(e)}`);
    } finally {
      s.getState().setBusy(false);
    }
  }

  return { onFetch, onExtract, onCancel, onRetryFailed };
}
