/**
 * Locale-aware smart typography: quotes, apostrophes, dashes, ellipsis,
 * no-break spaces, and math symbols. Pure string logic, no DOM
 * dependency, so it's independently unit-testable and reusable outside
 * the editor (e.g. a future export pipeline).
 *
 * Markdown source stays untouched and ASCII-clean — this only produces a
 * list of {from, to, replacement} spans for a caller (the CM6 decoration
 * layer) to render as display-only substitutions. It never mutates text
 * itself. Callers are responsible for not invoking this over code spans,
 * fenced code, frontmatter, or link targets — this module has no
 * Markdown-structure awareness of its own.
 */

export type Locale = "en" | "de" | "fr";

export interface SmartMatch {
  from: number;
  to: number;
  replacement: string;
}

interface LocaleQuotes {
  primaryOpen: string;
  primaryClose: string;
  secondaryOpen: string;
  secondaryClose: string;
}

const QUOTES: Record<Locale, LocaleQuotes> = {
  en: { primaryOpen: "“", primaryClose: "”", secondaryOpen: "‘", secondaryClose: "’" },
  // German: low-opening, high-closing.
  de: { primaryOpen: "„", primaryClose: "“", secondaryOpen: "‚", secondaryClose: "‘" },
  // French: guillemets with a narrow no-break space (U+202F) baked in.
  fr: {
    primaryOpen: "« ",
    primaryClose: " »",
    secondaryOpen: "‹ ",
    secondaryClose: " ›",
  },
};

const LETTER_RE = /[a-zA-ZÀ-ÖØ-öø-ÿ]/;
const DIGIT_RE = /[0-9]/;
const UNIT_RE = /^(kg|g|mg|km|cm|mm|m|kb|mb|gb|tb|Hz|kHz|MHz|GHz|%)\b/;

/**
 * Scans `text` once and returns non-overlapping, offset-sorted
 * replacement spans. Single-pass by design: each detector consults only
 * the original string, so there's no intermediate-string offset drift to
 * reconcile between passes.
 */
export function findSmartTypographyMatches(text: string, locale: Locale): SmartMatch[] {
  const matches: SmartMatch[] = [];
  const quotes = QUOTES[locale];

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    const next = i + 1 < text.length ? text[i + 1] : "";

    // Ellipsis: "..." -> "…"
    if (ch === "." && text[i + 1] === "." && text[i + 2] === ".") {
      matches.push({ from: i, to: i + 3, replacement: "…" });
      i += 3;
      continue;
    }

    // Dash: "word--word" (en usage: em dash, no spaces) or the same
    // pattern in German usage (en dash, spaced).
    if (ch === "-" && next === "-") {
      let from = i;
      let to = i + 2;
      if (text[from - 1] === " ") from -= 1;
      if (text[to] === " ") to += 1;
      const replacement = locale === "de" ? " – " : "—";
      matches.push({ from, to, replacement });
      i += 2;
      continue;
    }

    // Multiplication sign between two numbers: "2x3" or "2 x 3".
    if ((ch === "x" || ch === "X") && DIGIT_RE.test(prev) && DIGIT_RE.test(next)) {
      matches.push({ from: i, to: i + 1, replacement: "×" });
      i += 1;
      continue;
    }
    if (
      ch === "x" &&
      prev === " " &&
      next === " " &&
      DIGIT_RE.test(text[i - 2] ?? "") &&
      DIGIT_RE.test(text[i + 2] ?? "")
    ) {
      matches.push({ from: i, to: i + 1, replacement: "×" });
      i += 1;
      continue;
    }

    // True minus sign for a negative number at the start of a numeric
    // token (start of string, or after whitespace/an opening bracket).
    if (ch === "-" && DIGIT_RE.test(next) && (i === 0 || /[\s(]/.test(prev))) {
      matches.push({ from: i, to: i + 1, replacement: "−" });
      i += 1;
      continue;
    }

    // Quotes and apostrophes, resolved by local context rather than a
    // running open/close toggle (matches how a human reader disambiguates
    // them). A quote-or-apostrophe character after a digit and NOT
    // followed by a letter is a prime/double-prime (measurements), not a
    // quote or apostrophe.
    if (ch === '"' || ch === "'") {
      const isDouble = ch === '"';
      const afterDigit = DIGIT_RE.test(prev);
      const beforeLetter = LETTER_RE.test(next);
      if (afterDigit && !beforeLetter) {
        matches.push({ from: i, to: i + 1, replacement: isDouble ? "″" : "′" });
        i += 1;
        continue;
      }

      const openContext = i === 0 || /[\s([{—–]/.test(prev);
      const replacement = isDouble
        ? openContext
          ? quotes.primaryOpen
          : quotes.primaryClose
        : openContext
          ? quotes.secondaryOpen
          : quotes.secondaryClose;
      matches.push({ from: i, to: i + 1, replacement });
      i += 1;
      continue;
    }

    // No-break space between a number and a unit ("10 kg", "5 cm").
    if (ch === " " && DIGIT_RE.test(prev) && UNIT_RE.test(text.slice(i + 1))) {
      matches.push({ from: i, to: i + 1, replacement: " " });
      i += 1;
      continue;
    }

    // German convention: a no-break space before a percent sign, even
    // when the source has none directly adjacent ("19%" -> "19 %").
    if (locale === "de" && ch === "%" && DIGIT_RE.test(prev)) {
      matches.push({ from: i, to: i, replacement: " " });
      i += 1;
      continue;
    }

    i += 1;
  }

  return matches;
}

/** Applies findSmartTypographyMatches to produce a transformed string. */
export function smartenText(text: string, locale: Locale): string {
  const matches = findSmartTypographyMatches(text, locale);
  let result = "";
  let lastIndex = 0;
  for (const m of matches) {
    result += text.slice(lastIndex, m.from) + m.replacement;
    lastIndex = m.to;
  }
  result += text.slice(lastIndex);
  return result;
}
