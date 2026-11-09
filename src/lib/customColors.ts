/**
 * Custom background + text-contrast palette. Given one background color and
 * a contrast amount, derives the whole token set from tokens.css (gray
 * ramp, surfaces, text levels, hairlines, diff/hint colors) so every
 * component that reads those tokens follows without knowing about this
 * feature. Applied as inline custom properties on <html>, which beat both
 * the light and the OS-dark stylesheet values; removing them falls back to
 * the normal monochrome theme.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Text contrast range. 0 would make text the background color itself;
 *  the floor keeps the lowest setting faint but still readable. 1 is pure
 *  black (or white) on the background. */
export const CONTRAST_MIN = 0.35;
export const CONTRAST_MAX = 1;
/** Matches the default theme's --text-primary: #1a1a1a on white is a 0.9 mix. */
export const CONTRAST_DEFAULT = 0.9;

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Linear interpolation in sRGB from `a` (t=0) to `b` (t=1). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** WCAG 2 relative luminance, 0 (black) – 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio, 1 – 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whether text on this background should run toward black (light bg) or
 *  white (dark bg). The crossover is the luminance where black and white
 *  text have equal contrast. */
export function isLightBackground(bg: Rgb): boolean {
  return luminance(bg) > 0.179;
}

/* How far each gray-ramp step sits from the background toward the text
   pole, read off the default light ramp in tokens.css (#ffffff → #1a1a1a).
   Steps up to 300 are surfaces and hairlines and stay fixed so hover and
   borders remain visible at any contrast; 400 and up are text and scale
   with the contrast setting (900 = --text-primary = exactly `contrast`). */
const SURFACE_STEPS: Record<string, number> = {
  "0": 0,
  "50": 0.02,
  "100": 0.05,
  "150": 0.09,
  "200": 0.14,
  "300": 0.24,
};
const TEXT_STEPS: Record<string, number> = {
  "400": 0.37,
  "500": 0.51,
  "600": 0.64,
  "700": 0.76,
  "800": 0.85,
  "900": 0.9,
};

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/* Diff/hint accents aren't derivable from a gray mix — pick the light or
   dark set from tokens.css to match the background, not the OS. */
const ACCENTS_LIGHT = {
  "--diff-old-bg": "#fbeaea",
  "--diff-old-text": "#a02020",
  "--diff-new-bg": "#e8f5e9",
  "--diff-new-text": "#1f7a2e",
  "--hint-text": "#1a5fb4",
  "--hint-bg": "#eaf1fb",
};
const ACCENTS_DARK = {
  "--diff-old-bg": "#3a2323",
  "--diff-old-text": "#e08787",
  "--diff-new-bg": "#22331f",
  "--diff-new-text": "#85c98f",
  "--hint-text": "#7db2f2",
  "--hint-bg": "#202b3a",
};

export function clampContrast(c: number): number {
  return Math.min(CONTRAST_MAX, Math.max(CONTRAST_MIN, c));
}

/** The text color the given contrast setting produces on `bg`. */
export function textColorFor(bg: Rgb, contrast: number): Rgb {
  return mix(bg, isLightBackground(bg) ? BLACK : WHITE, clampContrast(contrast));
}

/** Every custom property to set on <html>, keyed by name. */
export function buildPalette(bgHex: string, contrast: number): Record<string, string> | null {
  const bg = parseHex(bgHex);
  if (!bg) return null;
  const light = isLightBackground(bg);
  const pole = light ? BLACK : WHITE;
  const textScale = clampContrast(contrast) / TEXT_STEPS["900"];

  const gray: Record<string, string> = {};
  for (const [step, t] of Object.entries(SURFACE_STEPS)) gray[step] = toHex(mix(bg, pole, t));
  for (const [step, t] of Object.entries(TEXT_STEPS)) gray[step] = toHex(mix(bg, pole, t * textScale));

  const vars: Record<string, string> = {};
  for (const [step, value] of Object.entries(gray)) vars[`--gray-${step}`] = value;

  // Same semantic mapping as the light theme in tokens.css, with the page
  // itself (--bg-panel) being exactly the chosen color.
  Object.assign(vars, {
    "--bg-app": gray["50"],
    "--bg-titlebar": gray["100"],
    "--bg-panel": gray["0"],
    "--bg-hover": gray["150"],
    "--bg-active": gray["200"],
    "--bg-hover-filelist": gray["100"],
    "--bg-active-filelist": gray["150"],
    "--text-primary": gray["900"],
    "--text-secondary": gray["600"],
    "--text-tertiary": gray["400"],
    "--border-hairline": gray["200"],
    "--tree-guide": gray["200"],
    ...(light ? ACCENTS_LIGHT : ACCENTS_DARK),
  });
  return vars;
}

/** Every property `buildPalette` may set — what to remove when turning
 *  custom colors off. */
export const PALETTE_PROPERTIES: readonly string[] = Object.keys(buildPalette("#ffffff", CONTRAST_DEFAULT)!);
