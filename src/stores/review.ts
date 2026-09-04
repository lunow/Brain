import { create } from "zustand";
import type { PlacedSuggestion, SuggestionFeedback } from "@/lib/reviewSuggestions";
import { saveReview, type SavedReviewMeta } from "@/lib/reviewPersistence";

/** Stable reference for "no suggestions for this file" — selectors must
 *  return this instead of a fresh `[]` literal, or every render produces a
 *  new array identity and zustand's getSnapshot loops forever. */
export const EMPTY_SUGGESTIONS: PlacedSuggestion[] = [];

interface ReviewState {
  suggestionsByFile: Record<string, PlacedSuggestion[]>;
  /** Which agent/instructions produced the current suggestion set for a
   *  file, and when — captured at run/load time rather than read live off
   *  selectedAgentId, since the sidebar's agent picker can move on to a
   *  different file before these suggestions are resolved. */
  reviewMetaByFile: Record<string, SavedReviewMeta>;
  selectedAgentId: string | null;
  customInstructions: string;
  running: boolean;
  error: string | null;
  skippedCount: number;

  setSelectedAgentId: (id: string | null) => void;
  setCustomInstructions: (text: string) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  setSuggestions: (
    filePath: string,
    suggestions: PlacedSuggestion[],
    skipped: number,
    runMeta: { agentId: string | null; agentLabel: string; customInstructions: string },
  ) => void;
  /** Seeds suggestions read back from a saved sidecar file. Unlike
   *  setSuggestions, this does not write back to disk — it IS what's on
   *  disk already. */
  loadSuggestions: (filePath: string, suggestions: PlacedSuggestion[], meta: SavedReviewMeta) => void;
  resolveSuggestion: (filePath: string, id: string) => void;
  /** Toggles a thumbs up/down rating on a suggestion — clicking the same
   *  rating again clears it. Purely local; doesn't touch the document. */
  setFeedback: (filePath: string, id: string, feedback: SuggestionFeedback) => void;
}

function persist(filePath: string, meta: SavedReviewMeta | undefined, suggestions: PlacedSuggestion[]) {
  if (!meta) return;
  void saveReview(
    filePath,
    meta,
    suggestions.map(({ from, to, ...rest }) => rest),
  ).catch(() => {});
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  suggestionsByFile: {},
  reviewMetaByFile: {},
  selectedAgentId: null,
  customInstructions: "",
  running: false,
  error: null,
  skippedCount: 0,

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setCustomInstructions: (text) => set({ customInstructions: text }),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),

  setSuggestions: (filePath, suggestions, skipped, runMeta) => {
    const meta: SavedReviewMeta = { ...runMeta, reviewedAt: new Date().toISOString() };
    set((state) => ({
      suggestionsByFile: { ...state.suggestionsByFile, [filePath]: suggestions },
      reviewMetaByFile: { ...state.reviewMetaByFile, [filePath]: meta },
      skippedCount: skipped,
    }));
    persist(filePath, meta, suggestions);
  },

  loadSuggestions: (filePath, suggestions, meta) =>
    set((state) => ({
      suggestionsByFile: { ...state.suggestionsByFile, [filePath]: suggestions },
      reviewMetaByFile: { ...state.reviewMetaByFile, [filePath]: meta },
    })),

  resolveSuggestion: (filePath, id) => {
    set((state) => ({
      suggestionsByFile: {
        ...state.suggestionsByFile,
        [filePath]: (state.suggestionsByFile[filePath] ?? []).filter((s) => s.id !== id),
      },
    }));
    persist(filePath, get().reviewMetaByFile[filePath], get().suggestionsByFile[filePath] ?? []);
  },

  setFeedback: (filePath, id, feedback) => {
    set((state) => ({
      suggestionsByFile: {
        ...state.suggestionsByFile,
        [filePath]: (state.suggestionsByFile[filePath] ?? []).map((s) =>
          s.id === id ? { ...s, feedback: s.feedback === feedback ? undefined : feedback } : s,
        ),
      },
    }));
    persist(filePath, get().reviewMetaByFile[filePath], get().suggestionsByFile[filePath] ?? []);
  },
}));
