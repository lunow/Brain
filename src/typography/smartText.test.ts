import { describe, expect, it } from "vitest";
import { smartenText } from "./smartText";

describe("smartenText — English", () => {
  it("resolves double quotes by context", () => {
    expect(smartenText('She said "hello" to me.', "en")).toBe("She said “hello” to me.");
  });

  it("resolves single quotes by context", () => {
    expect(smartenText("He said 'hi' back.", "en")).toBe("He said ‘hi’ back.");
  });

  it("renders a typographic apostrophe in contractions", () => {
    expect(smartenText("don't stop", "en")).toBe("don’t stop");
  });

  it("handles nested quotes", () => {
    expect(smartenText(`She said "it's 'fine'" today.`, "en")).toBe("She said “it’s ‘fine’” today.");
  });

  it("converts a double hyphen to an em dash with no spaces", () => {
    expect(smartenText("wait--really?", "en")).toBe("wait—really?");
  });

  it("converts a spaced double hyphen to an em dash, collapsing the spaces", () => {
    expect(smartenText("wait -- really?", "en")).toBe("wait—really?");
  });

  it("converts an ellipsis to a single glyph", () => {
    expect(smartenText("wait...", "en")).toBe("wait…");
  });

  it("inserts a no-break space between a number and a unit", () => {
    expect(smartenText("bring 10 kg of flour", "en")).toBe("bring 10 kg of flour");
  });

  it("renders a multiplication sign between two numbers, preserving source spacing", () => {
    expect(smartenText("a 2x3 grid", "en")).toBe("a 2×3 grid");
    expect(smartenText("a 2 x 3 grid", "en")).toBe("a 2 × 3 grid");
  });

  it("renders a true minus sign for a negative number", () => {
    expect(smartenText("the value is -5 today", "en")).toBe("the value is −5 today");
  });

  it("renders primes after a digit followed by non-letter (measurements)", () => {
    expect(smartenText(`he is 6' 2" tall`, "en")).toBe("he is 6′ 2″ tall");
  });

  it("does not touch a straight quote used as an apostrophe next to a digit+letter run", () => {
    // "80's" — apostrophe between digit and letter should stay an
    // apostrophe, not a prime, since a letter follows.
    expect(smartenText("the 80's", "en")).toBe("the 80’s");
  });
});

describe("smartenText — German", () => {
  it("resolves double quotes as low-opening / high-closing", () => {
    expect(smartenText('Er sagte "hallo" zu mir.', "de")).toBe("Er sagte „hallo“ zu mir.");
  });

  it("converts a double hyphen to a spaced en dash", () => {
    expect(smartenText("Moment--wirklich?", "de")).toBe("Moment – wirklich?");
  });

  it("inserts a no-break space before a percent sign", () => {
    expect(smartenText("19% USt", "de")).toBe("19 % USt");
  });

  it("inserts a no-break space between number and unit", () => {
    expect(smartenText("5 kg Mehl", "de")).toBe("5 kg Mehl");
  });

  it("handles real German compound content with umlauts and quotes together", () => {
    const input = 'Die "Rechtsschutzversicherungsgesellschaften" prüfen das--sofort.';
    const output = smartenText(input, "de");
    expect(output).toBe("Die „Rechtsschutzversicherungsgesellschaften“ prüfen das – sofort.");
  });
});

describe("smartenText — French", () => {
  it("resolves double quotes as guillemets with narrow no-break spaces", () => {
    expect(smartenText('Il a dit "bonjour" ce matin.', "fr")).toBe("Il a dit « bonjour » ce matin.");
  });
});

describe("smartenText — negative cases the caller must gate, verified at the string level", () => {
  it("does not alter text with no smart-typography triggers", () => {
    const plain = "const x = 1;";
    expect(smartenText(plain, "en")).toBe(plain);
  });

  it("leaves a URL's straight characters alone when there is nothing to match", () => {
    // No quotes/dashes-in-pairs/ellipsis present, so nothing changes —
    // this module has no URL awareness itself; excluding entire node
    // ranges (URL, code, frontmatter) is the CM6 integration's job, not
    // this module's, since it only ever sees the pre-scoped substring the
    // caller decides to pass in.
    const url = "https://example.com/path?a=1&b=2";
    expect(smartenText(url, "en")).toBe(url);
  });

  it("does not convert a single hyphen (word-hyphen) to a dash", () => {
    expect(smartenText("well-known fact", "en")).toBe("well-known fact");
  });

  it("does not treat a decimal point or single-letter x as multiplication/ellipsis", () => {
    expect(smartenText("version 1.2 uses index x", "en")).toBe("version 1.2 uses index x");
  });
});
