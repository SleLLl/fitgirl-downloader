import { check } from "@tauri-apps/plugin-updater";

/// Check for an update; if one exists, download + install it. Returns a
/// human-readable status. Requires `plugins.updater` (endpoints + pubkey) to be
/// configured in tauri.conf.json — until then `check()` errors and the caller
/// surfaces it.
export async function checkForUpdates(): Promise<string> {
  const update = await check();
  if (!update) return "You're on the latest version.";
  await update.downloadAndInstall();
  return `Installed v${update.version}. Restart the app to apply.`;
}
