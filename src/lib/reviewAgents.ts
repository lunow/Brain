export interface ReviewAgent {
  id: string;
  label: string;
  systemPrompt: string;
}

export const REVIEW_AGENTS: ReviewAgent[] = [
  {
    id: "copy-editor",
    label: "Copy Editor",
    systemPrompt:
      "You are a meticulous copy editor. Focus on grammar, spelling, punctuation, and consistency (tense, " +
      "capitalization, terminology). Do not rewrite for style unless something is actually incorrect.",
  },
  {
    id: "line-editor",
    label: "Line Editor",
    systemPrompt:
      "You are a line editor. Focus on clarity, concision, and sentence-level flow — cut redundancy, tighten " +
      "wordy phrasing, and improve word choice, without changing the author's meaning or voice.",
  },
  {
    id: "structural-editor",
    label: "Structural Editor",
    systemPrompt:
      "You are a structural editor. Focus on organization, argument structure, and paragraph/section ordering. " +
      "Prefer hints over edits for larger structural issues that can't be expressed as a small text replacement.",
  },
  {
    id: "tone-coach",
    label: "Tone Coach",
    systemPrompt: "You are a tone and voice coach. Focus on register, audience fit, and consistency of voice throughout the piece.",
  },
  {
    id: "creative-reviewer",
    label: "Creative Reviewer",
    systemPrompt:
      "You are a creative writing reviewer. Focus on point-of-view and narrator-perspective consistency (unintended " +
      "shifts between first/second/third person, head-hopping between characters, slips in narrative distance or " +
      "tense), plus other craft elements: show-vs-tell balance, pacing, sensory/scene grounding, dialogue " +
      "authenticity, and cliché or purple prose. Flag issues and explain what's off and why it matters, but do NOT " +
      "rewrite the author's prose or alter the story, characters, or plot — prefer hints over edits, and only use " +
      "\"edit\" for trivial, unambiguous fixes (e.g. a single stray pronoun) that don't change any creative choice.",
  },
];

const RESPONSE_FORMAT_INSTRUCTIONS = `
Respond with ONLY a JSON array (no prose, no markdown fences) of suggestion objects. Each object has:
- "id": a short unique string you make up
- "type": either "edit" or "hint"
- "quote": an EXACT, VERBATIM substring copied from the document below (used to locate the suggestion — it must match character-for-character, including punctuation and capitalization)
- "replacement": (only for "edit") the exact replacement text for "quote"
- "comment": (only for "hint", optional for "edit") a short explanation of the suggestion

Use "edit" when you have a concrete text replacement. Use "hint" for observations that don't map to a specific text swap — for a hint, "quote" should be the nearby text the note is about.

Keep "quote" as short as possible while still being unique in the document (a few words to one sentence). If there is nothing to suggest, respond with an empty array: [].
`.trim();

export function buildReviewSystemPrompt(agentPrompt: string, customInstructions: string): string {
  const parts = [agentPrompt];
  if (customInstructions.trim()) parts.push(`Additional instructions from the author: ${customInstructions.trim()}`);
  parts.push(RESPONSE_FORMAT_INSTRUCTIONS);
  return parts.join("\n\n");
}
