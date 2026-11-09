import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Menu.module.css";

export interface MenuItem {
  key: string;
  label: string;
  /** Keyboard shortcut, shown right-aligned. */
  hint?: string;
  icon?: ReactNode;
  /** Shows a check column: true/false for toggles and the current choice. */
  checked?: boolean;
  onSelect: () => void;
  /** Leave the menu open after choosing, for toggles worth flipping several
   *  of at once. */
  keepOpen?: boolean;
}

/** A toolbar button that opens a list of choices below it. */
export function Menu({
  trigger,
  label,
  items,
  align = "right",
  chevron = true,
  disabled = false,
}: {
  trigger: ReactNode;
  /** Accessible name and tooltip for the trigger. */
  label: string;
  items: MenuItem[];
  /** Which edge of the trigger the list lines up with. */
  align?: "left" | "center" | "right";
  chevron?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasChecks = items.some((item) => item.checked !== undefined);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        title={label}
      >
        {trigger}
        {chevron && <MenuChevron />}
      </button>
      {open && (
        <div className={styles.menu} role="menu" data-align={align}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              className={styles.item}
              onClick={() => {
                if (!item.keepOpen) setOpen(false);
                item.onSelect();
              }}
            >
              {hasChecks && <span className={styles.check}>{item.checked ? <CheckIcon /> : null}</span>}
              {item.icon && <span className={styles.icon}>{item.icon}</span>}
              <span className={styles.label}>{item.label}</span>
              {item.hint && <span className={styles.hint}>{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Set by the editor toolbar when its segmented bars don't fit; the bars
 *  read it and render as a Menu instead. */
export const CompactToolbarContext = createContext(false);

export function useCompactToolbar(): boolean {
  return useContext(CompactToolbarContext);
}

function MenuChevron() {
  return (
    <svg className={styles.chevron} width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.8 5.2 4 7.3 8.2 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
