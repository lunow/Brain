import { bundledThemes, createHighlighter, type Highlighter } from "shiki";

/**
 * Converts a well-designed theme's colors to grayscale (luminance-weighted)
 * rather than hand-authoring token rules from scratch, so fenced code still
 * gets a real highlighting hierarchy (weight/contrast) while honoring the
 * whole-app monochrome mandate.
 */
const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function hexToGray(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const gh = gray.toString(16).padStart(2, "0");
  return `#${gh}${gh}${gh}`;
}

function desaturateDeep<T>(value: T): T {
  if (typeof value === "string") return value.replace(HEX_RE, (m) => hexToGray(m)) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => desaturateDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = desaturateDeep(v);
    return out as T;
  }
  return value;
}

const LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "rust",
  "go",
  "json",
  "yaml",
  "toml",
  "bash",
  "css",
  "html",
  "sql",
  "c",
  "cpp",
  "swift",
  "ruby",
  "php",
  "diff",
  "markdown",
] as const;

export const LIGHT_THEME_NAME = "write-grayscale-light";
export const DARK_THEME_NAME = "write-grayscale-dark";

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [lightMod, darkMod] = await Promise.all([
        bundledThemes["github-light"](),
        bundledThemes["github-dark"](),
      ]);
      const lightTheme = { ...desaturateDeep((lightMod as { default: object }).default), name: LIGHT_THEME_NAME };
      const darkTheme = { ...desaturateDeep((darkMod as { default: object }).default), name: DARK_THEME_NAME };

      return createHighlighter({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        themes: [lightTheme as any, darkTheme as any],
        langs: [...LANGS],
      });
    })();
  }
  return highlighterPromise;
}

export async function highlightCodeToHtml(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  const resolvedLang = loaded.includes(lang as (typeof loaded)[number]) ? lang : "text";

  return highlighter.codeToHtml(code, {
    lang: resolvedLang,
    themes: { light: LIGHT_THEME_NAME, dark: DARK_THEME_NAME },
    defaultColor: false,
  });
}
