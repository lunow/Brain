import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useIdeateStore, EMPTY_MESSAGES } from "@/stores/ideate";
import { streamChatCompletion, type ChatMessage } from "@/lib/openrouter";

function buildSystemMessage(docContent: string): ChatMessage {
  return {
    role: "system",
    content:
      "You are a research and ideation assistant helping the user think through and research the following " +
      "draft. Offer ideas, ask clarifying questions, and suggest angles or sources to explore. You are not " +
      "editing the text directly, just discussing it.\n\n---\n" +
      docContent +
      "\n---",
  };
}

/** Drives the Ideate sidebar's chat: grounds each request in the currently
 *  open file's live content, keeps history per file via `useIdeateStore`,
 *  and streams the assistant's reply token-by-token. */
export function useIdeateChat() {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const apiKey = useSettingsStore((s) => s.openrouterApiKey);
  const model = useSettingsStore((s) => s.defaultModel);

  const messages = useIdeateStore((s) =>
    selectedFilePath ? (s.messagesByFile[selectedFilePath] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );
  const sending = useIdeateStore((s) => s.sending);
  const error = useIdeateStore((s) => s.error);
  const appendMessage = useIdeateStore((s) => s.appendMessage);
  const appendToLastMessage = useIdeateStore((s) => s.appendToLastMessage);
  const setSending = useIdeateStore((s) => s.setSending);
  const setError = useIdeateStore((s) => s.setError);
  const clearChatAction = useIdeateStore((s) => s.clearChat);
  const dropTrailingEmptyAssistant = useIdeateStore((s) => s.dropTrailingEmptyAssistant);

  async function sendMessage(text: string) {
    const filePath = selectedFilePath;
    const trimmed = text.trim();
    if (!filePath || !trimmed || sending) return;
    if (!apiKey) {
      setError("Add your OpenRouter API key in Settings to start chatting.");
      return;
    }

    setError(null);
    appendMessage(filePath, { role: "user", content: trimmed });
    appendMessage(filePath, { role: "assistant", content: "" });
    setSending(true);

    // Read the live CodeMirror doc rather than the file-content query cache
    // — that cache never refreshes as the user types or after autosave, so
    // it would ground the assistant in stale, potentially pre-edit text.
    const docContent = useUiStore.getState().activeEditorView?.state.doc.toString() ?? "";
    const history = useIdeateStore.getState().messagesByFile[filePath] ?? [];
    // Drop the empty assistant placeholder just appended — it's the target
    // of the stream, not part of the request.
    const requestMessages = [buildSystemMessage(docContent), ...history.slice(0, -1)];

    try {
      await streamChatCompletion({ apiKey, model, messages: requestMessages }, (delta) => {
        appendToLastMessage(filePath, delta);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      dropTrailingEmptyAssistant(filePath);
    } finally {
      setSending(false);
    }
  }

  return {
    messages,
    sending,
    error,
    sendMessage,
    clearChat: () => selectedFilePath && clearChatAction(selectedFilePath),
    hasFile: !!selectedFilePath,
    hasApiKey: !!apiKey,
  };
}
