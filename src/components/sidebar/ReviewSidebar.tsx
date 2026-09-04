import { useUiStore } from "@/stores/ui";
import { useWorkspaceStore } from "@/stores/workspace";
import { useReviewStore } from "@/stores/review";
import { useReviewRun } from "@/hooks/useReviewRun";
import { applyReviewAction, type SuggestionAction } from "@/components/editor/extensions/reviewSuggestions";
import { GearIcon, ThumbsDownIcon, ThumbsUpIcon } from "@/components/common/icons";
import type { PlacedSuggestion, SuggestionFeedback } from "@/lib/reviewSuggestions";
import { InlineWordDiff } from "./InlineWordDiff";
import styles from "./ReviewSidebar.module.css";

export function ReviewSidebar() {
  const openSettings = useUiStore((s) => s.openSettings);
  const activeView = useUiStore((s) => s.activeEditorView);
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath);
  const resolveSuggestion = useReviewStore((s) => s.resolveSuggestion);
  const setFeedback = useReviewStore((s) => s.setFeedback);

  const {
    agents,
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
    hasFile,
  } = useReviewRun();

  function handleAction(suggestion: PlacedSuggestion, action: SuggestionAction) {
    if (activeView) {
      applyReviewAction(activeView, suggestion, action, (id) => selectedFilePath && resolveSuggestion(selectedFilePath, id));
    } else if (selectedFilePath) {
      resolveSuggestion(selectedFilePath, suggestion.id);
    }
  }

  function handleFeedback(suggestion: PlacedSuggestion, feedback: SuggestionFeedback) {
    if (selectedFilePath) setFeedback(selectedFilePath, suggestion.id, feedback);
  }

  function handleJump(suggestion: PlacedSuggestion) {
    if (!activeView) return;
    activeView.dispatch({ selection: { anchor: suggestion.from, head: suggestion.to }, scrollIntoView: true });
    activeView.focus();
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        Review
        <button type="button" className={styles.iconButton} onClick={openSettings} title="Settings">
          <GearIcon />
        </button>
      </div>

      <div className={styles.controls}>
        <div>
          <div className={styles.sectionLabel}>Agent</div>
          <div className={styles.agentGrid}>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={styles.agentPill}
                data-active={selectedAgentId === agent.id}
                onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
              >
                {agent.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className={styles.textarea}
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Custom instructions (optional)…"
        />

        <button
          type="button"
          className={styles.runButton}
          onClick={runReview}
          disabled={!canRun}
          title="Run the selected agent against this file"
        >
          {running ? "Running…" : "Run Review"}
        </button>

        {error && <div className={styles.error}>{error}</div>}
        {skippedCount > 0 && (
          <div className={styles.skipped}>
            {skippedCount} suggestion{skippedCount === 1 ? "" : "s"} could not be placed and {skippedCount === 1 ? "was" : "were"}{" "}
            skipped.
          </div>
        )}
      </div>

      {!hasFile ? (
        <div className={styles.emptyState}>Select a file to review.</div>
      ) : suggestions.length === 0 ? (
        <div className={styles.emptyState}>{running ? "Reviewing…" : "No suggestions yet. Run an agent above."}</div>
      ) : (
        <div className={styles.list}>
          {suggestions.map((s) => (
            <div
              key={s.id}
              className={styles.suggestion}
              onClick={() => handleJump(s)}
              title="Jump to this suggestion in the file"
            >
              {s.type === "edit" ? (
                <>
                  <InlineWordDiff oldText={s.quote} newText={s.replacement ?? ""} />
                  {s.comment && <div className={styles.suggestionComment}>{s.comment}</div>}
                  <div className={styles.suggestionActions} onClick={(e) => e.stopPropagation()}>
                    <FeedbackButtons suggestion={s} onRate={handleFeedback} />
                    <button
                      type="button"
                      className={styles.suggestionButton}
                      onClick={() => handleAction(s, "accept")}
                      title="Accept this suggestion"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={styles.suggestionButton}
                      onClick={() => handleAction(s, "reject")}
                      title="Reject this suggestion"
                    >
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.suggestionComment}>{s.comment}</div>
                  <div className={styles.suggestionActions} onClick={(e) => e.stopPropagation()}>
                    <FeedbackButtons suggestion={s} onRate={handleFeedback} />
                    <button
                      type="button"
                      className={styles.suggestionButton}
                      onClick={() => handleAction(s, "dismiss")}
                      title="Dismiss this suggestion"
                    >
                      Dismiss
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Thumbs up/down rating for a suggestion — separate from Accept/Reject/
 *  Dismiss, which apply or drop the edit. Purely local feedback on the
 *  suggestion's quality. */
function FeedbackButtons({
  suggestion,
  onRate,
}: {
  suggestion: PlacedSuggestion;
  onRate: (suggestion: PlacedSuggestion, feedback: SuggestionFeedback) => void;
}) {
  return (
    <div className={styles.feedbackGroup}>
      <button
        type="button"
        className={styles.feedbackButton}
        data-kind="up"
        data-active={suggestion.feedback === "up"}
        onClick={() => onRate(suggestion, "up")}
        title="Good suggestion"
      >
        <ThumbsUpIcon />
      </button>
      <button
        type="button"
        className={styles.feedbackButton}
        data-kind="down"
        data-active={suggestion.feedback === "down"}
        onClick={() => onRate(suggestion, "down")}
        title="Bad suggestion"
      >
        <ThumbsDownIcon />
      </button>
    </div>
  );
}
