import { create } from "zustand";
import { getSettings, setSettings, type AppSettings } from "@/lib/tauri-commands";

interface SettingsState {
  openrouterApiKey: string | null;
  defaultModel: string;
  loaded: boolean;

  /** Loads persisted settings once at app start. */
  hydrate: () => Promise<void>;
  /** Updates local state immediately and persists in the background. */
  updateSettings: (patch: Partial<Pick<SettingsState, "openrouterApiKey" | "defaultModel">>) => void;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export const useSettingsStore = create<SettingsState>((set, get) => ({
  openrouterApiKey: null,
  defaultModel: DEFAULT_MODEL,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) return;
    const settings: AppSettings = await getSettings();
    set({
      openrouterApiKey: settings.openrouterApiKey,
      defaultModel: settings.defaultModel || DEFAULT_MODEL,
      loaded: true,
    });
  },

  updateSettings: (patch) => {
    set(patch);
    const { openrouterApiKey, defaultModel } = get();
    setSettings({ openrouterApiKey, defaultModel });
  },
}));
