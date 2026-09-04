import { diffWordsWithSpace } from "diff";

export interface WordDiffPart {
  type: "equal" | "removed" | "added";
  value: string;
}

/** Word-level diff between a suggestion's original quote and its
 *  replacement, used to render only the sub-spans that actually changed
 *  (inline, in place) instead of swapping the whole sentence. */
export function computeWordDiff(oldText: string, newText: string): WordDiffPart[] {
  return diffWordsWithSpace(oldText, newText).map((part) => ({
    type: part.added ? "added" : part.removed ? "removed" : "equal",
    value: part.value,
  }));
}
