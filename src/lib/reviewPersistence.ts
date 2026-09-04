import { readFile, writeFile } from "@/lib/tauri-commands";
import type { RawSuggestion, SuggestionFeedback } from "@/lib/reviewSuggestions";

export type SavedSuggestion = RawSuggestion & { feedback?: SuggestionFeedback };

export interface SavedReviewMeta {
  agentId: string | null;
  agentLabel: string;
  customInstructions: string;
  reviewedAt: string;
}

interface SavedReviewFile extends SavedReviewMeta {
  version: 1;
  fileName: string;
  suggestions: SavedSuggestion[];
}

function basenameOf(filePath: string): string {
  const sepIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return sepIndex >= 0 ? filePath.slice(sepIndex + 1) : filePath;
}

/** Hidden sidecar next to the document itself, e.g. `Chapter1.md` ->
 *  `.Chapter1.md.review.json`. The leading dot keeps it out of
 *  list_markdown_files (which already skips dotfiles) and the file tree. */
function sidecarPathFor(filePath: string): string {
  const sepIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dir = sepIndex >= 0 ? filePath.slice(0, sepIndex + 1) : "";
  return `${dir}.${basenameOf(filePath)}.review.json`;
}

/** Reads the saved review sidecar for a document, if any. Resolves to null
 *  on any read/parse failure — most commonly, no review has been run yet. */
export async function loadSavedReview(filePath: string): Promise<SavedReviewFile | null> {
  try {
    const text = await readFile(sidecarPathFor(filePath));
    const parsed = JSON.parse(text) as Partial<SavedReviewFile> | null;
    if (!parsed || !Array.isArray(parsed.suggestions)) return null;
    return parsed as SavedReviewFile;
  } catch {
    return null;
  }
}

/** Overwrites the saved review sidecar for a document with the current
 *  suggestion set. One sidecar per document — a later run (of any agent)
 *  replaces the previous one, mirroring how in-memory suggestions already
 *  behave. Called after every run and every accept/reject/dismiss/feedback
 *  change, so the file on disk always mirrors what's on screen. */
export async function saveReview(filePath: string, meta: SavedReviewMeta, suggestions: SavedSuggestion[]): Promise<void> {
  const payload: SavedReviewFile = { version: 1, fileName: basenameOf(filePath), ...meta, suggestions };
  await writeFile(sidecarPathFor(filePath), JSON.stringify(payload, null, 2));
}
