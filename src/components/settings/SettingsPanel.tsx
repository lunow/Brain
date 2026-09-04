import { useEffect } from "react";
import { useUiStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import styles from "./SettingsPanel.module.css";

/**
 * OpenRouter API key + default model, opened from the Ideate/Review sidebar
 * headers. Persisted via src-tauri/src/commands/settings.rs (a plaintext
 * JSON store — same trust model as the workspace-roots store).
 */
export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const openrouterApiKey = useSettingsStore((s) => s.openrouterApiKey);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Settings">
        <div className={styles.title}>Settings</div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="openrouter-api-key">
              OpenRouter API key
            </label>
            <input
              id="openrouter-api-key"
              className={styles.input}
              type="password"
              value={openrouterApiKey ?? ""}
              onChange={(e) => updateSettings({ openrouterApiKey: e.target.value || null })}
              placeholder="sk-or-..."
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className={styles.hint}>Stored locally in the app's settings file, unencrypted.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="openrouter-model">
              Model
            </label>
            <input
              id="openrouter-model"
              className={styles.input}
              type="text"
              value={defaultModel}
              onChange={(e) => updateSettings({ defaultModel: e.target.value })}
              placeholder="anthropic/claude-sonnet-4.5"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className={styles.hint}>Any OpenRouter model id. Used for both Ideate and Review.</span>
          </div>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.doneButton} onClick={close} title="Close (Esc)">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
