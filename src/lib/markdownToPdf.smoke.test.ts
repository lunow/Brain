import { describe, expect, it } from "vitest";
import { markdownPageCount, markdownToPdfBytes } from "./markdownToPdf";

const SAMPLE = `---
title: Ignored
---

# Report Title

Some **bold**, *italic*, \`inline code\`, ~~strike~~ and a [link](https://example.com).

## Section

- item one
- item two
  - nested item
- [x] done task
- [ ] todo task

1. first
2. second

> A quoted line with **emphasis** inside.

\`\`\`js
function hello() {
  return "world";
}
\`\`\`

| Col A | Col B |
|-------|-------|
| 1     | 2     |
| longer value | x |

---

![an image](missing.png)

Final paragraph after a rule with a very long run of text that should wrap across multiple lines within the printable page width to exercise the word-wrap engine end to end.
`;

describe("markdownToPdfBytes", () => {
  it("renders a full document to non-trivial PDF bytes", () => {
    const bytes = markdownToPdfBytes(SAMPLE, "Report Title");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("handles an empty document without throwing", () => {
    const bytes = markdownToPdfBytes("", "Empty");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("paginates a long document across multiple pages", () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph number ${i} with some filler text to take up space.`).join("\n\n");
    const bytes = markdownToPdfBytes(long, "Long");
    const text = new TextDecoder("latin1").decode(bytes);
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageMatches.length).toBeGreaterThan(1);
  });
});

describe("markdownPageCount", () => {
  it("counts the last page by how full it is", () => {
    const paragraph = "A sentence of ordinary length that runs on for a while. ".repeat(20);
    const oneParagraph = markdownPageCount(paragraph);
    expect(oneParagraph).toBeGreaterThan(0);
    expect(oneParagraph).toBeLessThan(1);
  });

  it("matches the number of pages the export produces", () => {
    const long = "A sentence of ordinary length that runs on for a while.\n\n".repeat(200);
    const exported = new TextDecoder("latin1").decode(markdownToPdfBytes(long, "t"));
    const pages = exported.match(/\/Type \/Page\b(?!s)/g)?.length;
    expect(Math.ceil(markdownPageCount(long))).toBe(pages);
  });
});
