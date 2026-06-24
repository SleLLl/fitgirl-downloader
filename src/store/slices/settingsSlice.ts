import type { StateCreator } from "zustand";
import type { Settings } from "@/lib/settings";
import type { AppStore, Theme } from "../types";

function initialTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/// App settings (download concurrency etc.) and the UI theme.
export type SettingsSlice = {
  settings: Settings | null;
  theme: Theme;
  setSettings: (settings: Settings) => void;
  setTheme: (theme: Theme) => void;
};

export const createSettingsSlice: StateCreator<
  AppStore,
  [],
  [],
  SettingsSlice
> = (set) => ({
  settings: null,
  theme: initialTheme(),
  setSettings: (settings) => set({ settings }),
  setTheme: (theme) => {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    set({ theme });
  },
});
