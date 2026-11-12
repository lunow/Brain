import { create } from "zustand";

/* Table-view preferences shared by every CSV file. localStorage like the
   rest of the UI prefs: per machine. */
const WRAP_STORAGE_KEY = "write:csvWrap";

function loadWrap(): boolean {
  try {
    return localStorage.getItem(WRAP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface CsvPrefsState {
  /** Wrap long cell text onto several lines instead of truncating it. */
  wrap: boolean;
  toggleWrap: () => void;
}

export const useCsvPrefs = create<CsvPrefsState>((set) => ({
  wrap: loadWrap(),
  toggleWrap: () =>
    set((state) => {
      const wrap = !state.wrap;
      try {
        localStorage.setItem(WRAP_STORAGE_KEY, wrap ? "1" : "0");
      } catch {
        // Storage unavailable — the toggle just won't persist.
      }
      return { wrap };
    }),
}));
