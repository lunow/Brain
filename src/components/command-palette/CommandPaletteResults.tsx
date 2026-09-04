import type { RefObject } from "react";
import { FolderIcon } from "@/components/common/icons";
import type { PaletteResult, ResultGroup } from "./commandPalette.logic";
import styles from "./CommandPalette.module.css";

interface CommandPaletteResultsProps {
  groups: ResultGroup[];
  activeIndex: number;
  activeItemRef: RefObject<HTMLDivElement | null>;
  /** Nav index (folders/files) is still loading for a non-empty query. */
  searching: boolean;
  onHover: (index: number) => void;
  onSelect: (item: PaletteResult) => void;
}

/** Renders the palette's sectioned, keyboard-navigable result list. */
export function CommandPaletteResults({ groups, activeIndex, activeItemRef, searching, onHover, onSelect }: CommandPaletteResultsProps) {
  let runningIndex = -1;

  return (
    <div className={styles.list}>
      {groups.length === 0 && !searching && <div className={styles.empty}>No matches.</div>}
      {searching && <div className={styles.empty}>Searching…</div>}
      {groups.map((group) => (
        <div key={group.label}>
          <div className={styles.sectionLabel}>{group.label}</div>
          {group.items.map((item) => {
            runningIndex += 1;
            const index = runningIndex;
            const isActive = index === activeIndex;
            const key = item.type === "command" ? item.id : item.path;
            return (
              <div
                key={key}
                ref={isActive ? activeItemRef : undefined}
                role="option"
                aria-selected={isActive}
                className={styles.row}
                data-active={isActive}
                onMouseEnter={() => onHover(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                {item.type === "folder" && <FolderIcon className={styles.rowIcon} />}
                <div className={styles.rowText}>
                  <span className={styles.rowLabel}>{item.type === "command" ? item.label : item.name}</span>
                  {item.type !== "command" && <span className={styles.rowPath}>{item.path}</span>}
                </div>
                {item.type === "command" && item.hint && <span className={styles.rowHint}>{item.hint}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
