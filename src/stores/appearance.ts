import { create } from "zustand";
import { clampContrast, CONTRAST_DEFAULT, parseHex } from "@/lib/customColors";

/* Per-machine display preference, so localStorage like the panel layout
   rather than the Tauri settings file (which holds the API key/model). */
const STORAGE_KEY = "write:customColors";

/** A warm paper tone: the first thing worth seeing on enabling the feature,
 *  rather than plain white that looks like nothing happened. */
export const DEFAULT_BACKGROUND = "#f4ecd8";

interface StoredCustomColors {
  enabled: boolean;
  background: string;
  contrast: number;
}

const DEFAULTS: StoredCustomColors = { enabled: false, background: DEFAULT_BACKGROUND, contrast: CONTRAST_DEFAULT };

function load(): StoredCustomColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as StoredCustomColors;
    return {
      enabled: !!parsed.enabled,
      background: parseHex(parsed.background) ? parsed.background : DEFAULT_BACKGROUND,
      contrast: clampContrast(Number(parsed.contrast) || CONTRAST_DEFAULT),
    };
  } catch {
    return DEFAULTS;
  }
}

function save(state: StoredCustomColors) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — the setting just won't survive a restart.
  }
}

interface AppearanceState extends StoredCustomColors {
  /** Shift+Cmd+B. */
  toggleCustomColors: () => void;
  setCustomColorsEnabled: (enabled: boolean) => void;
  setBackground: (hex: string) => void;
  setContrast: (contrast: number) => void;
}

const initial = load();

export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const update = (patch: Partial<StoredCustomColors>) => {
    set(patch);
    const { enabled, background, contrast } = get();
    save({ enabled, background, contrast });
  };
  return {
    ...initial,
    toggleCustomColors: () => update({ enabled: !get().enabled }),
    setCustomColorsEnabled: (enabled) => update({ enabled }),
    setBackground: (background) => {
      if (parseHex(background)) update({ background });
    },
    setContrast: (contrast) => update({ contrast: clampContrast(contrast) }),
  };
});
