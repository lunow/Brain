import { computeWordDiff } from "@/lib/wordDiff";
import styles from "./InlineWordDiff.module.css";

/** Renders only the sub-spans that changed between `oldText` and
 *  `newText` inline — shared text stays plain, matching the same
 *  word-level diff used for the in-editor decorations (see
 *  extensions/reviewSuggestions.ts) so the sidebar list and the document
 *  agree on what actually changed. */
export function InlineWordDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = computeWordDiff(oldText, newText);
  return (
    <p className={styles.diff}>
      {parts.map((part, i) => {
        if (part.type === "equal") return <span key={i}>{part.value}</span>;
        if (part.type === "removed") {
          return (
            <del key={i} className={styles.removed}>
              {part.value}
            </del>
          );
        }
        return (
          <ins key={i} className={styles.added}>
            {part.value}
          </ins>
        );
      })}
    </p>
  );
}
