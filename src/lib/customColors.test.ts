import { describe, expect, it } from "vitest";
import { buildPalette, contrastRatio, parseHex, textColorFor, CONTRAST_MIN, PALETTE_PROPERTIES } from "./customColors";

describe("parseHex", () => {
  it("accepts 3- and 6-digit hex with or without #", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("1a1A1a")).toEqual({ r: 26, g: 26, b: 26 });
    expect(parseHex("nope")).toBeNull();
  });
});

describe("buildPalette", () => {
  it("reproduces the default light theme from white at contrast 0.9", () => {
    const p = buildPalette("#ffffff", 0.9)!;
    expect(p["--bg-panel"]).toBe("#ffffff");
    expect(p["--text-primary"]).toBe("#1a1a1a");
    expect(p["--hint-text"]).toBe("#1a5fb4");
  });

  it("runs text toward white on a dark background", () => {
    const p = buildPalette("#000000", 1)!;
    expect(p["--text-primary"]).toBe("#ffffff");
    expect(p["--hint-text"]).toBe("#7db2f2");
  });

  it("raising contrast raises the text/background ratio", () => {
    const bg = parseHex("#f4ecd8")!;
    const low = contrastRatio(bg, textColorFor(bg, CONTRAST_MIN));
    const high = contrastRatio(bg, textColorFor(bg, 1));
    expect(high).toBeGreaterThan(low);
  });

  it("returns null for an invalid color and always sets the same properties", () => {
    expect(buildPalette("#zzz", 0.9)).toBeNull();
    expect(Object.keys(buildPalette("#123456", 0.5)!)).toEqual(PALETTE_PROPERTIES);
  });
});
