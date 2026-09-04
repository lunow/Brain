import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useReviewStore, EMPTY_SUGGESTIONS } from "@/stores/review";
import { chatCompletion } from "@/lib/openrouter";
import { REVIEW_AGENTS, buildReviewSystemPrompt } from "@/lib/reviewAgents";
import { locateSuggestions, parseReviewResponse } from "@/lib/reviewSuggestions";

/** Drives the Review sidebar: builds the system prompt from the selected
 *  predefined agent (if any) plus free-text custom instructions, runs one
 *  non-streaming OpenRouter call against the currently open file, and turns
 *  the JSON response into suggestions placed at real document offsets. */
export function useReviewRun() {
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const apiKey = useSettingsStore((s) => s.openrouterApiKey);
  const model = useSettingsStore((s) => s.defaultModel);

  const selectedAgentId = useReviewStore((s) => s.selectedAgentId);
  const customInstructions = useReviewStore((s) => s.customInstructions);
  const running = useReviewStore((s) => s.running);
  const error = useReviewStore((s) => s.error);
  const skippedCount = useReviewStore((s) => s.skippedCount);
  const setSelectedAgentId = useReviewStore((s) => s.setSelectedAgentId);
  const setCustomInstructions = useReviewStore((s) => s.setCustomInstructions);
  const setRunning = useReviewStore((s) => s.setRunning);
  const setError = useReviewStore((s) => s.setError);
  const setSuggestions = useReviewStore((s) => s.setSuggestions);
  const suggestions = useReviewStore((s) =>
    selectedFilePath ? (s.suggestionsByFile[selectedFilePath] ?? EMPTY_SUGGESTIONS) : EMPTY_SUGGESTIONS,
  );

  const selectedAgent = REVIEW_AGENTS.find((a) => a.id === selectedAgentId) ?? null;
  const canRun = !!selectedFilePath && !running && (!!selectedAgent || customInstructions.trim().length > 0);

  async function runReview() {
    if (!selectedFilePath || running) return;
    if (!apiKey) {
      setError("Add your OpenRouter API key in Settings to run a review.");
      return;
    }
    if (!selectedAgent && !customInstructions.trim()) {
      setError("Pick an agent or add custom instructions first.");
      return;
    }
    if (!useUiStore.getState().activeEditorView) {
      setError("The editor isn't ready yet — try again in a moment.");
      return;
    }

    setError(null);
    setRunning(true);

    // Read straight from the live CodeMirror doc, not the file-content
    // query cache: that cache only refreshes on load/external change, so
    // it's already stale the moment there's an unsaved edit (autosave
    // doesn't invalidate it) — locating suggestions against it would drift
    // from what's actually on screen.
    const view = useUiStore.getState().activeEditorView;
    const docContent = view?.state.doc.toString() ?? "";
    const basePrompt = selectedAgent?.systemPrompt ?? "You are a careful editorial reviewer.";
    const systemPrompt = buildReviewSystemPrompt(basePrompt, customInstructions);

    try {
      const responseText = await chatCompletion({
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: docContent },
        ],
      });
      const raw = parseReviewResponse(responseText);
      const { placed, skipped } = locateSuggestions(docContent, raw);
      setSuggestions(selectedFilePath, placed, skipped, {
        agentId: selectedAgentId,
        agentLabel: selectedAgent?.label ?? "Custom instructions",
        customInstructions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return {
    agents: REVIEW_AGENTS,
    selectedAgentId,
    setSelectedAgentId,
    customInstructions,
    setCustomInstructions,
    running,
    error,
    skippedCount,
    suggestions,
    canRun,
    runReview,
    hasFile: !!selectedFilePath,
  };
}
