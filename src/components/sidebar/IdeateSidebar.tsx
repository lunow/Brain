import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/stores/ui";
import { useIdeateChat } from "@/hooks/useIdeateChat";
import { GearIcon } from "@/components/common/icons";
import { MarkdownMessage } from "./MarkdownMessage";
import styles from "./IdeateSidebar.module.css";

export function IdeateSidebar() {
  const openSettings = useUiStore((s) => s.openSettings);
  const { messages, sending, error, sendMessage, hasFile, hasApiKey } = useIdeateChat();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Keeps the newest text in view, one scroll per frame.
   *
   * Driven by the DOM rather than by `messages`: MarkdownMessage commits
   * streamed content on its own frame schedule (see useFrameCoalesced), so a
   * scroll scheduled when `messages` changes measures the list before the
   * taller content is there — and after the final token nothing schedules
   * another one, which left the tail of an answer below the fold. The
   * observer fires once React has committed, so the growth and the scroll
   * that follows it can't get out of step.
   *
   * Still coalesced to a frame: reading scrollHeight forces a layout, and a
   * streamed answer mutates this subtree continuously.
   */
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const stick = () => {
      if (scrollFrame.current !== null) return;
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null;
        el.scrollTo({ top: el.scrollHeight });
      });
    };

    stick();
    const observer = new MutationObserver(stick);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (scrollFrame.current !== null) {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
    };
    // The list is only rendered once there's a file and a key, so the effect
    // has to re-run when it mounts to find it.
  }, [hasFile, hasApiKey]);

  function handleSend() {
    if (!draft.trim() || sending) return;
    sendMessage(draft);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        Research Agent
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconButton} onClick={openSettings} title="Settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {!hasFile ? (
        <div className={styles.emptyState}>
          <p>Select a file to start researching.</p>
        </div>
      ) : !hasApiKey ? (
        <div className={styles.emptyState}>
          <p>Add your OpenRouter API key to start chatting with the research agent.</p>
          <button type="button" className={styles.primaryButton} onClick={openSettings}>
            Open Settings
          </button>
        </div>
      ) : (
        <>
          <div className={styles.body} ref={listRef}>
            {messages.length === 0 && (
              <div className={styles.emptyState}>
                <p>Ask about angles, sources, or open questions in this draft.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={styles.message} data-role={m.role} data-empty={m.content === ""}>
                {/* Only the agent's side is markdown. A user's turn is the
                    literal text they typed — rendering it would eat their
                    asterisks and underscores. */}
                {m.role === "assistant" && m.content ? (
                  <MarkdownMessage content={m.content} />
                ) : (
                  m.content || (m.role === "assistant" && sending ? "…" : "")
                )}
              </div>
            ))}
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.composer}>
            <textarea
              className={styles.textarea}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the research agent…"
              disabled={sending}
            />
            <button
              type="button"
              className={styles.sendButton}
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              title="Send (Enter)"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
