import type { BlockParser, MarkdownConfig } from "@lezer/markdown";

/**
 * Recognizes a leading `---\n...\n---` YAML frontmatter block as a single
 * opaque "Frontmatter" node. Runs before the built-in HorizontalRule parser
 * so the opening `---` isn't mistaken for a thematic break, and — critically
 * — its content is never handed to the inline parser, so stray `[...]` or
 * `**...**` inside frontmatter values can't be misread as markdown syntax
 * (e.g. YAML `tags: [a, b]`).
 */
const frontmatterBlockParser: BlockParser = {
  name: "Frontmatter",
  before: "HorizontalRule",
  parse(cx, line) {
    if (cx.lineStart !== 0 || line.text !== "---") return false;

    const from = cx.lineStart;
    let to = cx.lineStart + line.text.length;

    while (cx.nextLine()) {
      to = cx.lineStart + line.text.length;
      if (line.text === "---") {
        cx.nextLine();
        break;
      }
    }

    cx.addElement(cx.elt("Frontmatter", from, to));
    return true;
  },
};

export const frontmatterExtension: MarkdownConfig = {
  defineNodes: ["Frontmatter"],
  parseBlock: [frontmatterBlockParser],
};
