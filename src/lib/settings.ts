import { invoke } from "@tauri-apps/api/core";

export type Settings = {
  downloadDir: string | null;
  fileConcurrency: number;
  segments: number;
};

export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>("set_setting", { key, value });
}

export function resumeAll(): Promise<void> {
  return invoke<void>("resume_all");
}
