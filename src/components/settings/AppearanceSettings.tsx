import { useEffect, useState } from "react";
import { useAppearanceStore } from "@/stores/appearance";
import {
  contrastRatio,
  CONTRAST_MAX,
  CONTRAST_MIN,
  parseHex,
  textColorFor,
  toHex,
  buildPalette,
} from "@/lib/customColors";
import styles from "./SettingsPanel.module.css";

const PRESETS: { name: string; hex: string }[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Paper", hex: "#f4ecd8" },
  { name: "Mist", hex: "#e6ebe8" },
  { name: "Sky", hex: "#e3ecf5" },
  { name: "Slate", hex: "#2b2f36" },
  { name: "Night", hex: "#121212" },
];

function wcagLabel(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "Low";
}

/**
 * Background color + text contrast, toggled with Shift+Cmd+B. Editing any
 * control switches custom colors on, so the change is visible immediately.
 */
export function AppearanceSettings() {
  const enabled = useAppearanceStore((s) => s.enabled);
  const background = useAppearanceStore((s) => s.background);
  const contrast = useAppearanceStore((s) => s.contrast);
  const setEnabled = useAppearanceStore((s) => s.setCustomColorsEnabled);
  const setBackground = useAppearanceStore((s) => s.setBackground);
  const setContrast = useAppearanceStore((s) => s.setContrast);

  // Typed hex is held locally so a half-typed "#f4e" doesn't get rejected
  // (or applied) mid-keystroke; it syncs back when the store changes.
  const [hexDraft, setHexDraft] = useState(background);
  useEffect(() => setHexDraft(background), [background]);

  const bg = parseHex(background)!;
  const ratio = contrastRatio(bg, textColorFor(bg, contrast));
  const preview = buildPalette(background, contrast)!;

  function pickBackground(hex: string) {
    setBackground(hex);
    setEnabled(true);
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Custom colors</span>
        <span className={styles.kbd}>⇧⌘B</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Custom colors"
          className={styles.switch}
          data-on={enabled}
          onClick={() => setEnabled(!enabled)}
        >
          <span className={styles.switchKnob} />
        </button>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Background</span>
        <div className={styles.swatchRow}>
          {PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              className={styles.swatch}
              style={{ background: p.hex }}
              data-selected={p.hex.toLowerCase() === background.toLowerCase()}
              title={p.name}
              aria-label={p.name}
              onClick={() => pickBackground(p.hex)}
            />
          ))}
          <input
            type="color"
            className={styles.colorInput}
            value={toHex(bg)}
            onChange={(e) => pickBackground(e.target.value)}
            title="Pick any color"
            aria-label="Pick any background color"
          />
          <input
            className={`${styles.input} ${styles.hexInput}`}
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const v = e.target.value.trim();
              if (parseHex(v)) pickBackground(v.startsWith("#") ? v : `#${v}`);
            }}
            onBlur={() => setHexDraft(background)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Background hex color"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="text-contrast">
          Text contrast
          <span className={styles.labelValue}>
            {ratio.toFixed(1)}:1 · {wcagLabel(ratio)}
          </span>
        </label>
        <input
          id="text-contrast"
          type="range"
          className={styles.range}
          min={CONTRAST_MIN}
          max={CONTRAST_MAX}
          step={0.01}
          value={contrast}
          onChange={(e) => {
            setContrast(Number(e.target.value));
            setEnabled(true);
          }}
        />
      </div>

      <div className={styles.preview} style={{ background: preview["--bg-panel"], borderColor: preview["--border-hairline"] }}>
        <div style={{ color: preview["--text-primary"] }}>The quick brown fox jumps over the lazy dog.</div>
        <div style={{ color: preview["--text-secondary"] }}>Secondary text, like file previews.</div>
        <div style={{ color: preview["--text-tertiary"] }}>Tertiary text, like dates and hints.</div>
      </div>
    </div>
  );
}
