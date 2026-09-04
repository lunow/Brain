import { create } from "zustand";
import type { ChatMessage } from "@/lib/openrouter";

/** Stable reference for "no messages for this file" — selectors must return
 *  this instead of a fresh `[]` literal, or every render produces a new
 *  array identity and zustand's getSnapshot loops forever. */
export const EMPTY_MESSAGES: ChatMessage[] = [];

interface IdeateState {
  /** User/assistant turns only, keyed by file path — the grounding system
   *  message is rebuilt fresh from the document on every send rather than
   *  stored, so it never goes stale mid-conversation. */
  messagesByFile: Record<string, ChatMessage[]>;
  sending: boolean;
  error: string | null;

  appendMessage: (filePath: string, message: ChatMessage) => void;
  appendToLastMessage: (filePath: string, delta: string) => void;
  setSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
  clearChat: (filePath: string) => void;
  /** Drops a trailing empty assistant message — used when a request fails
   *  before any tokens arrived, so no blank bubble is left behind. */
  dropTrailingEmptyAssistant: (filePath: string) => void;
}

export const useIdeateStore = create<IdeateState>((set) => ({
  messagesByFile: {},
  sending: false,
  error: null,

  appendMessage: (filePath, message) =>
    set((state) => ({
      messagesByFile: {
        ...state.messagesByFile,
        [filePath]: [...(state.messagesByFile[filePath] ?? []), message],
      },
    })),

  appendToLastMessage: (filePath, delta) =>
    set((state) => {
      const existing = state.messagesByFile[filePath] ?? [];
      if (existing.length === 0) return state;
      const last = existing[existing.length - 1];
      const updated = [...existing.slice(0, -1), { ...last, content: last.content + delta }];
      return { messagesByFile: { ...state.messagesByFile, [filePath]: updated } };
    }),

  setSending: (sending) => set({ sending }),
  setError: (error) => set({ error }),

  clearChat: (filePath) =>
    set((state) => {
      const next = { ...state.messagesByFile };
      delete next[filePath];
      return { messagesByFile: next };
    }),

  dropTrailingEmptyAssistant: (filePath) =>
    set((state) => {
      const existing = state.messagesByFile[filePath] ?? [];
      const last = existing[existing.length - 1];
      if (!last || last.role !== "assistant" || last.content !== "") return state;
      return { messagesByFile: { ...state.messagesByFile, [filePath]: existing.slice(0, -1) } };
    }),
}));
