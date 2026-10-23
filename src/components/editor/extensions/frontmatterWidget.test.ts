import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatterWidget";

describe("parseFrontmatter", () => {
  it("reads top-level key/value pairs and strips quotes", () => {
    expect(parseFrontmatter('---\ntitle: "Hello: world"\nlang: de\n---')).toEqual([
      { key: "title", value: "Hello: world" },
      { key: "lang", value: "de" },
    ]);
  });

  it("puts list items, flow or block, one per line", () => {
    expect(parseFrontmatter("---\ntags: [a, 'b c']\nauthors:\n  - Ann\n  - Bo\n---")).toEqual([
      { key: "tags", value: "a\nb c" },
      { key: "authors", value: "Ann\nBo" },
    ]);
  });

  it("keeps block scalar lines and skips comments and blanks", () => {
    expect(parseFrontmatter("---\n# note\nsummary: |\n  line one\n  line two\n\ndone: true\n---")).toEqual([
      { key: "summary", value: "line one\nline two" },
      { key: "done", value: "true" },
    ]);
  });

  it("handles an unclosed block", () => {
    expect(parseFrontmatter("---\nid: 1")).toEqual([{ key: "id", value: "1" }]);
  });
});
