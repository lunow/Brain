import type { ReactNode } from "react";
import { useUiStore, type WidthPreset } from "@/stores/ui";
import { WidthNarrowIcon, WidthNormalIcon, WidthFullIcon } from "@/components/common/icons";
import { ExportMenu, type ExportKind } from "./ExportMenu";
import styles from "./WidthToolbar.module.css";

const OPTIONS: { key: WidthPreset; label: string; hint: string; Icon: typeof WidthNarrowIcon }[] = [
  { key: "narrow", label: "Narrow", hint: "⇧⌘1", Icon: WidthNarrowIcon },
  { key: "normal", label: "Width", hint: "⇧⌘2", Icon: WidthNormalIcon },
  { key: "full", label: "Full", hint: "⇧⌘3", Icon: WidthFullIcon },
];

export function WidthToolbar({
  dirty,
  onExport,
  disabled = false,
  leading,
  center,
}: {
  dirty: boolean;
  onExport: (kind: ExportKind) => void;
  disabled?: boolean;
  /** Rendered first in the toolbar's left section — the panel-visibility
   *  toggles. */
  leading?: ReactNode;
  /** Rendered in the toolbar's centered section — the Ideate/Write/Review
   *  mode toggle. Kept in its own flex section (rather than inline with
   *  leading/trailing content) so it stays visually centered on the row
   *  regardless of how much sits to either side of it. */
  center?: ReactNode;
}) {
  const widthPreset = useUiStore((s) => s.widthPreset);
  const setWidthPreset = useUiStore((s) => s.setWidthPreset);

  return (
    <div className={styles.toolbar} data-tauri-drag-region>
      <div className={styles.side}>
        {leading}
        <span className={styles.dirtyDot} data-visible={dirty} title="Unsaved changes" />
      </div>
      <div className={styles.center}>{center}</div>
      <div className={`${styles.side} ${styles.sideEnd}`}>
        <div className={styles.group}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={styles.option}
              data-active={widthPreset === opt.key}
              onClick={() => setWidthPreset(opt.key)}
              disabled={disabled}
              title={`${opt.label} (${opt.hint})`}
              aria-label={opt.label}
            >
              <opt.Icon />
            </button>
          ))}
        </div>
        <ExportMenu onExport={onExport} disabled={disabled} />
      </div>
    </div>
  );
}
