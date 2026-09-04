export interface RawSuggestion {
  id: string;
  type: "edit" | "hint";
  quote: string;
  replacement?: string;
  comment?: string;
}

export type SuggestionFeedback = "up" | "down";

export interface PlacedSuggestion extends RawSuggestion {
  from: number;
  to: number;
  /** Local, non-destructive rating of the suggestion itself — separate
   *  from accept/reject, which apply or drop the edit. */
  feedback?: SuggestionFeedback;
}

export interface LocateResult {
  placed: PlacedSuggestion[];
  skipped: number;
}

/**
 * Locates each suggestion's `quote` in `docText` via substring search. LLM
 * output isn't guaranteed to reproduce the source verbatim, so suggestions
 * whose quote can't be found are dropped rather than mis-placed. Repeated
 * identical quotes are matched to successive occurrences in document order
 * (each search resumes just past the previous match for that same string).
 */
export function locateSuggestions(docText: string, raw: RawSuggestion[]): LocateResult {
  const placed: PlacedSuggestion[] = [];
  let skipped = 0;
  const searchFrom = new Map<string, number>();

  for (const s of raw) {
    if (!s.quote) {
      skipped += 1;
      continue;
    }
    const start = searchFrom.get(s.quote) ?? 0;
    const from = docText.indexOf(s.quote, start);
    if (from === -1) {
      skipped += 1;
      continue;
    }
    searchFrom.set(s.quote, from + 1);
    placed.push({ ...s, from, to: from + s.quote.length });
  }

  placed.sort((a, b) => a.from - b.from);
  return { placed, skipped };
}

/**
 * Defensive parse of a model response that's supposed to be a raw JSON
 * array but may come wrapped in a ```json fence or with stray prose around
 * it. Throws if no array can be recovered.
 */
export function parseReviewResponse(text: string): RawSuggestion[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const arrayMatch = candidate.match(/\[[\s\S]*\]/);
  const jsonText = arrayMatch ? arrayMatch[0] : candidate;

  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("Review response was not a JSON array.");

  return parsed.filter(
    (s): s is RawSuggestion =>
      !!s && typeof s === "object" && typeof s.quote === "string" && (s.type === "edit" || s.type === "hint"),
  );
}
