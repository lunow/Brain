import { Annotation } from "@codemirror/state";

/**
 * Marks a document change that came from disk (the file was rewritten by
 * another program) rather than from the user, so MarkdownEditor's change
 * listener doesn't report it back as an edit to autosave.
 */
export const externalReloadAnnotation = Annotation.define<boolean>();

export interface Replacement {
  from: number;
  to: number;
  insert: string;
}

/**
 * The smallest single replacement that turns `current` into `next`.
 *
 * Trimming the shared prefix and suffix matters: CodeMirror maps the
 * selection, decorations and scroll anchor through the changed range only, so
 * replacing just the differing middle leaves everything outside it — and the
 * view's vertical position — untouched. Replacing the whole document instead
 * (or remounting the editor) is what makes the editor jump back to the top.
 *
 * Returns null when the two strings are identical.
 */
export function minimalReplacement(current: string, next: string): Replacement | null {
  if (current === next) return null;

  const max = Math.min(current.length, next.length);

  let prefix = 0;
  while (prefix < max && current.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
  // Never split a surrogate pair: a boundary between the two halves of an
  // astral character would leave lone surrogates in the document.
  if (prefix > 0 && isHighSurrogate(current.charCodeAt(prefix - 1))) prefix--;

  let suffix = 0;
  while (
    suffix < max - prefix &&
    current.charCodeAt(current.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix++;
  }
  if (suffix > 0 && isLowSurrogate(current.charCodeAt(current.length - suffix))) suffix--;

  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
