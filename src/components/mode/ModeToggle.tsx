import { useUiStore, type WritingMode } from "@/stores/ui";
import styles from "./ModeToggle.module.css";

const OPTIONS: { key: WritingMode; label: string; hint: string }[] = [
  { key: "ideate", label: "Ideate", hint: "⌘1" },
  { key: "explore", label: "Explore", hint: "⌘2" },
  { key: "write", label: "Write", hint: "⌘3" },
  { key: "review", label: "Review", hint: "⌘4" },
];

export function ModeToggle() {
  const writingMode = useUiStore((s) => s.writingMode);
  const setWritingMode = useUiStore((s) => s.setWritingMode);

  return (
    <div className={styles.group}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={styles.option}
          data-active={writingMode === opt.key}
          onClick={() => setWritingMode(opt.key)}
          title={`${opt.label} (${opt.hint})`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
