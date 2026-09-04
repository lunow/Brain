import { useEffect, useRef, useState } from "react";
import { ExportIcon } from "@/components/common/icons";
import styles from "./ExportMenu.module.css";

const OPTIONS = [
  { key: "pdf", label: "PDF" },
  { key: "word", label: "Word" },
  { key: "publish", label: "Publish" },
] as const;

export type ExportKind = (typeof OPTIONS)[number]["key"];

export function ExportMenu({
  onExport,
  disabled = false,
}: {
  onExport: (kind: ExportKind) => void;
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

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export"
        disabled={disabled}
        title="Export"
      >
        <ExportIcon />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onExport(opt.key);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
