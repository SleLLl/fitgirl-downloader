import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/// Fire an OS notification that a download finished, requesting permission on
/// first use. No-ops silently if the user declines.
export async function notifyDownloadDone(filename: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (granted) {
    sendNotification({ title: "Download complete", body: filename });
  }
}
