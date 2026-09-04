import { useMemo, useState } from "react";
import { smartenText, type Locale } from "@/typography/smartText";
import styles from "./TypographySpecimen.module.css";

type Family = "serif" | "sans";
type Theme = "auto" | "light" | "dark";

const GERMAN_SAMPLE =
  'Die "Rechtsschutzversicherungsgesellschaften" prüfen den Vertrag -- das dauert oft 10 Tage. ' +
  "Bei Rückfragen erreichen Sie uns unter 0,5 % Zinsen p.a., zzgl. 19% USt. Größe: 5 kg, Preis: -3 € Rabatt.";

const ENGLISH_SAMPLE =
  'She said "it\'s ready" and left -- quietly, without a word. The shipment weighs 10 kg and costs -5 EUR ' +
  "after the discount. It's a 2x3 grid, and it took... forever.";

const MIXED_SAMPLE =
  'Meeting notes: "Ship it," she said -- in English -- then switched: "Wir liefern das heute." ' +
  "Cost: 19% USt, 5 kg total.";

const STRESS_LINE = `Straight: "quotes" and 'apostrophes' — Dashes: - -- --- — En-dash range: 2015-2019 — ` +
  `Figures: 1234567890 — Primes: 5' 11" — Emoji: 🚀✨ inline with text — Ellipsis: wait...`;

function useMediaQueryDebug(): boolean {
  return typeof window !== "undefined" && window.location.search.includes("debug");
}

export function TypographySpecimen() {
  const [measure, setMeasure] = useState<"narrow" | "default" | "wide">("default");
  const [family, setFamily] = useState<Family>("serif");
  const [smart, setSmart] = useState(true);
  const [hyphenate, setHyphenate] = useState(true);
  const [locale, setLocale] = useState<Locale>("de");
  const [theme, setTheme] = useState<Theme>("auto");
  const showDebug = useMediaQueryDebug();

  const sample = useMemo(() => {
    const raw = locale === "de" ? GERMAN_SAMPLE : locale === "fr" ? MIXED_SAMPLE : ENGLISH_SAMPLE;
    return smart ? smartenText(raw, locale) : raw;
  }, [locale, smart]);

  const stress = useMemo(() => (smart ? smartenText(STRESS_LINE, "en") : STRESS_LINE), [smart]);

  const measureVar =
    measure === "narrow" ? "var(--measure-narrow)" : measure === "wide" ? "78ch" : "var(--measure)";

  return (
    <div
      className={styles.page}
      data-theme={theme === "auto" ? undefined : theme}
      style={{ fontFamily: family === "sans" ? "var(--font-sans)" : undefined }}
    >
      <div className={styles.controls}>
        <label>
          Measure:
          <select value={measure} onChange={(e) => setMeasure(e.target.value as typeof measure)}>
            <option value="narrow">Narrow (60ch)</option>
            <option value="default">Default (68ch)</option>
            <option value="wide">Wide (78ch)</option>
          </select>
        </label>
        <label>
          Family:
          <select value={family} onChange={(e) => setFamily(e.target.value as Family)}>
            <option value="serif">Serif (New York)</option>
            <option value="sans">Sans (SF Pro)</option>
          </select>
        </label>
        <label>
          Locale:
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="fr">French</option>
          </select>
        </label>
        <label>
          Theme:
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="auto">Auto (OS)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} />
          Smart typography
        </label>
        <label>
          <input type="checkbox" checked={hyphenate} onChange={(e) => setHyphenate(e.target.checked)} />
          Hyphenation
        </label>
        <span className={styles.hint}>Append ?debug to the URL for the baseline grid + chars-per-line counter.</span>
      </div>

      <div
        className={`${styles.content} prose`}
        style={{ maxWidth: measureVar, hyphens: hyphenate ? "auto" : "none" }}
        data-debug={showDebug || undefined}
        lang={locale}
      >
        {showDebug && <CharsPerLineCounter />}

        <h1>Typography Specimen</h1>
        <p>
          Reference bar: Superhuman for glyph and rendering detail, GitHub for Markdown elements, macOS for calm
          restraint. This page renders through the exact <code>.prose</code> styles the app itself uses.
        </p>

        <h2>Headings</h2>
        <h1>Heading One</h1>
        <h2>Heading Two</h2>
        <h3>Heading Three</h3>
        <h4>Heading Four</h4>
        <h5>Heading Five</h5>
        <h6>Heading Six</h6>

        <h2>Sample paragraph ({locale})</h2>
        <p>{sample}</p>

        <h2>Stress line</h2>
        <p className={styles.stress}>{stress}</p>

        <h2>Lists</h2>
        <ul>
          <li>Unordered item one</li>
          <li>
            Unordered item two with <strong>bold</strong> and <em>italic</em> text
          </li>
          <li>Unordered item three</li>
        </ul>
        <ol>
          <li>Ordered item one</li>
          <li>Ordered item two</li>
        </ol>

        <h2>Blockquote</h2>
        <blockquote>
          <p>A blockquote should read as a quiet aside — muted color, a hairline edge, never forced italics.</p>
        </blockquote>

        <h2>Code</h2>
        <p>
          Inline code like <code>const x = 1;</code> reads at a smaller size with ligatures disabled.
        </p>
        <pre>
          <code>{`function greet(name) {\n  return \`Hello, \${name}!\`;\n}`}</code>
        </pre>

        <h2>Table</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Consulting</td>
              <td style={{ textAlign: "right" }}>1.234,56 €</td>
            </tr>
            <tr>
              <td>Materials</td>
              <td style={{ textAlign: "right" }}>89,00 €</td>
            </tr>
          </tbody>
        </table>

        <h2>Links</h2>
        <p>
          A <a href="#specimen">link example</a> to check underline offset, thickness, and skip-ink.
        </p>

        <hr />
        <p>End of specimen.</p>
      </div>
    </div>
  );
}

function CharsPerLineCounter() {
  return (
    <div className={styles.debugOverlay} aria-hidden="true">
      <div className={styles.baselineGrid} />
    </div>
  );
}
