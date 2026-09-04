/**
 * Typed mirror of the numeric values in src/styles/tokens/typography.css,
 * for any JS/TS code that needs the actual numbers rather than a CSS
 * `var()` reference (e.g. width/measure math). CSS custom properties can't
 * be imported into TS directly without a build-time token pipeline, which
 * is disproportionate for this app's size — keep these two files in sync
 * by hand; the values here should always match the .css file exactly.
 */

export const typeScale = {
  editorBody: 17,
  editorH1: 28,
  editorH2: 23,
  editorH3: 19,
  editorH4: 17,
  editorH5: 17,
  editorH6: 17,
  editorCode: 15,
  uiLabel: 15,
  uiCaption: 12,
  uiMicro: 11,
} as const;

export const leading = {
  display: 1.1,
  tight: 1.25,
  body: 1.6,
  code: 1.5,
  ui: 1.4,
} as const;

export const tracking = {
  display1: -0.021,
  display2: -0.011,
  body: 0,
  label: 0.04,
} as const;

export const measure = {
  narrow: 60,
  default: 68,
} as const;
