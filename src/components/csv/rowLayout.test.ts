import { describe, expect, it } from "vitest";
import { ROW_HEIGHT, estimateLines, estimateRowHeights, heightForLines, uniformLayout, variableLayout } from "./rowLayout";

describe("rowLayout", () => {
  it("uniform layout is arithmetic", () => {
    const l = uniformLayout(10);
    expect(l.total).toBe(10 * ROW_HEIGHT);
    expect(l.top(3)).toBe(3 * ROW_HEIGHT);
    expect(l.rowAt(3 * ROW_HEIGHT + 1)).toBe(3);
    expect(l.rowAt(1e9)).toBe(9);
  });

  it("variable layout finds rows by offset", () => {
    const l = variableLayout(new Float64Array([30, 66, 30]));
    expect(l.total).toBe(126);
    expect(l.top(2)).toBe(96);
    expect(l.rowAt(0)).toBe(0);
    expect(l.rowAt(30)).toBe(1);
    expect(l.rowAt(95)).toBe(1);
    expect(l.rowAt(96)).toBe(2);
    expect(l.rowAt(500)).toBe(2);
  });

  it("estimates wrapped lines, honoring line breaks", () => {
    expect(estimateLines("short", 10)).toBe(1);
    expect(estimateLines("a".repeat(25), 10)).toBe(3);
    expect(estimateLines("one\ntwo\n\nfour", 10)).toBe(4);
  });

  it("row height is the tallest cell, never below one line", () => {
    const rows = [["a", "b"], ["x".repeat(30), "y"], []];
    const h = estimateRowHeights(3, (r) => rows[r], [100, 100], 10);
    expect(Array.from(h)).toEqual([ROW_HEIGHT, heightForLines(3), ROW_HEIGHT]);
  });
});
