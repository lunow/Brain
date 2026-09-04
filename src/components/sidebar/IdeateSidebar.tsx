import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/stores/ui";
import { useIdeateChat } from "@/hooks/useIdeateChat";
import { GearIcon } from "@/components/common/icons";
import styles from "./IdeateSidebar.module.css";

export function IdeateSidebar() {
  const openSettings = useUiStore((s) => s.openSettings);
  const { messages, sending, error, sendMessage, hasFile, hasApiKey } = useIdeateChat();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

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
                {m.content || (m.role === "assistant" && sending ? "…" : "")}
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
