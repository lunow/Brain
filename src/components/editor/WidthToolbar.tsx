import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useUiStore, type WidthPreset } from "@/stores/ui";
import { WidthNarrowIcon, WidthNormalIcon, WidthFullIcon, WidthA4Icon } from "@/components/common/icons";
import { CompactToolbarContext, Menu, useCompactToolbar } from "@/components/common/Menu";
import { ExportMenu, type ExportKind } from "./ExportMenu";
import styles from "./WidthToolbar.module.css";

const OPTIONS: { key: WidthPreset; label: string; hint?: string; Icon: typeof WidthNarrowIcon }[] = [
  { key: "narrow", label: "Narrow", hint: "⇧⌘1", Icon: WidthNarrowIcon },
  { key: "normal", label: "Width", hint: "⇧⌘2", Icon: WidthNormalIcon },
  { key: "full", label: "Full", hint: "⇧⌘3", Icon: WidthFullIcon },
  // No ⇧⌘4: macOS takes it for its screenshot tool before the app sees it.
  { key: "a4", label: "A4", Icon: WidthA4Icon },
];

interface ToolbarProps {
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
}

/**
 * The editor column's header row. Its segmented bars (layout, mode, view)
 * turn into dropdowns once the column is too narrow to show them side by
 * side, instead of squeezing and clipping each other.
 *
 * "Too narrow" is measured, not a breakpoint: an invisible copy of the row
 * with the bars always expanded reports how wide it has to be, and the real
 * row goes compact whenever it is narrower than that. The copy follows
 * whatever the bars currently hold (the Sidebar toggle only exists in some
 * modes), so the threshold is always the true one.
 */
export function WidthToolbar(props: ToolbarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const update = () => {
      const [left, center, right] = Array.from(measure.children) as HTMLElement[];
      // The two sides share the leftover space equally so the centre stays
      // centred, so the wider side sets the width for both.
      const style = getComputedStyle(row);
      const needed =
        2 * Math.max(left.offsetWidth, right.offsetWidth) +
        center.offsetWidth +
        2 * (parseFloat(style.columnGap) || 0) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight);
      setCompact(row.clientWidth < needed);
    };
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(measure);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.toolbar} ref={rowRef} data-tauri-drag-region>
      <CompactToolbarContext.Provider value={compact}>
        <ToolbarSections {...props} />
      </CompactToolbarContext.Provider>
      <div className={styles.measure} ref={measureRef} aria-hidden="true" inert>
        <CompactToolbarContext.Provider value={false}>
          <ToolbarSections {...props} />
        </CompactToolbarContext.Provider>
      </div>
    </div>
  );
}

function ToolbarSections({ dirty, onExport, disabled = false, leading, center }: ToolbarProps) {
  return (
    <>
      <div className={styles.side}>
        {leading}
        <span className={styles.dirtyDot} data-visible={dirty} title="Unsaved changes" />
      </div>
      <div className={styles.center}>{center}</div>
      <div className={`${styles.side} ${styles.sideEnd}`}>
        <WidthPicker disabled={disabled} />
        <ExportMenu onExport={onExport} disabled={disabled} />
      </div>
    </>
  );
}

function WidthPicker({ disabled }: { disabled: boolean }) {
  const widthPreset = useUiStore((s) => s.widthPreset);
  const setWidthPreset = useUiStore((s) => s.setWidthPreset);
  const compact = useCompactToolbar();

  if (compact) {
    const current = OPTIONS.find((opt) => opt.key === widthPreset) ?? OPTIONS[0];
    return (
      <Menu
        trigger={<current.Icon />}
        label="View"
        disabled={disabled}
        items={OPTIONS.map((opt) => ({
          key: opt.key,
          label: opt.label,
          hint: opt.hint,
          icon: <opt.Icon />,
          checked: widthPreset === opt.key,
          onSelect: () => setWidthPreset(opt.key),
        }))}
      />
    );
  }

  return (
    <div className={styles.group}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={styles.option}
          data-active={widthPreset === opt.key}
          onClick={() => setWidthPreset(opt.key)}
          disabled={disabled}
          title={opt.hint ? `${opt.label} (${opt.hint})` : opt.label}
          aria-label={opt.label}
        >
          <opt.Icon />
        </button>
      ))}
    </div>
  );
}
