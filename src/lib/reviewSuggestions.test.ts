import { describe, expect, it } from "vitest";
import { locateSuggestions, parseReviewResponse, type RawSuggestion } from "./reviewSuggestions";

describe("locateSuggestions", () => {
  it("places a found quote at its character offsets", () => {
    const doc = "The quick brown fox jumps over the lazy dog.";
    const raw: RawSuggestion[] = [{ id: "1", type: "edit", quote: "quick brown", replacement: "slow gray" }];
    const { placed, skipped } = locateSuggestions(doc, raw);
    expect(skipped).toBe(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].from).toBe(doc.indexOf("quick brown"));
    expect(placed[0].to).toBe(doc.indexOf("quick brown") + "quick brown".length);
  });

  it("skips a quote that isn't verbatim in the document", () => {
    const doc = "The quick brown fox jumps over the lazy dog.";
    const raw: RawSuggestion[] = [{ id: "1", type: "edit", quote: "sluggish fox", replacement: "x" }];
    const { placed, skipped } = locateSuggestions(doc, raw);
    expect(skipped).toBe(1);
    expect(placed).toHaveLength(0);
  });

  it("skips an empty quote", () => {
    const { placed, skipped } = locateSuggestions("hello world", [{ id: "1", type: "edit", quote: "", replacement: "x" }]);
    expect(skipped).toBe(1);
    expect(placed).toHaveLength(0);
  });

  it("maps repeated identical quotes to successive occurrences in document order", () => {
    const doc = "cat sat on the cat mat, and the cat ran.";
    const raw: RawSuggestion[] = [
      { id: "a", type: "edit", quote: "cat", replacement: "dog" },
      { id: "b", type: "edit", quote: "cat", replacement: "dog" },
      { id: "c", type: "edit", quote: "cat", replacement: "dog" },
    ];
    const { placed, skipped } = locateSuggestions(doc, raw);
    expect(skipped).toBe(0);
    expect(placed).toHaveLength(3);
    const offsets = [...doc.matchAll(/cat/g)].map((m) => m.index);
    expect(placed.map((p) => p.from)).toEqual(offsets);
  });

  it("returns suggestions sorted by document position regardless of input order", () => {
    const doc = "alpha beta gamma";
    const raw: RawSuggestion[] = [
      { id: "gamma", type: "edit", quote: "gamma", replacement: "x" },
      { id: "alpha", type: "edit", quote: "alpha", replacement: "x" },
    ];
    const { placed } = locateSuggestions(doc, raw);
    expect(placed.map((p) => p.id)).toEqual(["alpha", "gamma"]);
  });
});

describe("parseReviewResponse", () => {
  it("parses a raw JSON array", () => {
    const result = parseReviewResponse('[{"id":"1","type":"edit","quote":"a","replacement":"b"}]');
    expect(result).toEqual([{ id: "1", type: "edit", quote: "a", replacement: "b" }]);
  });

  it("parses an array wrapped in a ```json fence with surrounding prose", () => {
    const text = 'Here are my suggestions:\n```json\n[{"id":"1","type":"hint","quote":"x","comment":"y"}]\n```\nLet me know!';
    const result = parseReviewResponse(text);
    expect(result).toEqual([{ id: "1", type: "hint", quote: "x", comment: "y" }]);
  });

  it("drops entries missing a valid type or quote", () => {
    const text = '[{"id":"1","type":"edit","quote":"ok"},{"id":"2","type":"bogus","quote":"x"},{"id":"3","type":"hint"}]';
    const result = parseReviewResponse(text);
    expect(result).toEqual([{ id: "1", type: "edit", quote: "ok" }]);
  });

  it("throws when no JSON array can be recovered", () => {
    expect(() => parseReviewResponse("no json here")).toThrow();
  });
});
