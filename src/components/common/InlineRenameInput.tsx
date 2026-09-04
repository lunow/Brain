import { useEffect, useRef } from "react";
import styles from "./InlineRenameInput.module.css";

interface InlineRenameInputProps {
  initialName: string;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}

/** Selects the filename stem (not the extension) on mount, mirroring Finder. */
export function InlineRenameInput({ initialName, onCommit, onCancel }: InlineRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Deferred to the next frame: when rename is triggered from a context
    // menu item, Radix's own close-focus-restoration would otherwise win
    // the race and steal focus back to the menu's trigger.
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const dot = initialName.lastIndexOf(".");
      el.setSelectionRange(0, dot > 0 ? dot : initialName.length);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      className={styles.input}
      defaultValue={initialName}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const value = e.currentTarget.value.trim();
        if (value && value !== initialName) onCommit(value);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const value = e.currentTarget.value.trim();
          if (value && value !== initialName) onCommit(value);
          else onCancel();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
    />
  );
}
