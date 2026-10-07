import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "./MarkdownMessage";

/** Renders an answer the way the Ideate sidebar would. */
function render(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownMessage, { content: markdown }));
}

describe("MarkdownMessage", () => {
  it("renders headings, emphasis and inline code", () => {
    const html = render("## Findings\n\nThe **key** point is *subtle* and `exact`.");
    expect(html).toContain("<h2");
    expect(html).toContain("Findings");
    expect(html).toContain("<strong>key</strong>");
    expect(html).toContain("<em>subtle</em>");
    expect(html).toContain("<code");
    expect(html).toContain("exact");
    // Markers are consumed, not printed.
    expect(html).not.toContain("**");
    expect(html).not.toContain("##");
  });

  it("renders bullet and ordered lists", () => {
    const html = render("- first\n- second\n\n1. one\n2. two");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html.match(/<li/g) ?? []).toHaveLength(4);
    expect(html).toContain("first");
    expect(html).toContain("two");
  });

  it("renders fenced code without treating its contents as markdown", () => {
    const html = render("```js\nconst a = **1**;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("const a = **1**;");
    expect(html).not.toContain("<strong>");
  });

  it("renders GFM tables", () => {
    const html = render("| Source | Year |\n| --- | --- |\n| Survey | 1904 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th>");
    expect(html).toContain("Source");
    expect(html).toContain("<td>");
    expect(html).toContain("1904");
  });

  it("renders GFM task lists with their text and checked state", () => {
    const html = render("- [x] Transcribe Alentejo\n- [ ] Transcribe Trieste");
    // The shape is ListItem > Task > TaskMarker with no Paragraph, so the
    // text is easy to drop on the floor.
    expect(html).toContain("Transcribe Alentejo");
    expect(html).toContain("Transcribe Trieste");
    expect(html.match(/<input[^>]*type="checkbox"/g) ?? []).toHaveLength(2);
    expect(html.match(/checked=""/g) ?? []).toHaveLength(1);
    // The literal marker is consumed.
    expect(html).not.toContain("[x]");
    expect(html).not.toContain("[ ]");
  });

  it("renders blockquotes and horizontal rules", () => {
    const html = render("> quoted claim\n\n---\n\nafter");
    expect(html).toContain("<blockquote");
    expect(html).toContain("quoted claim");
    expect(html).toContain("<hr");
  });

  it("links http(s) targets, including bare URLs", () => {
    const html = render("See [the source](https://example.com/a) and https://example.org/b too.");
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain("the source");
    expect(html).toContain('href="https://example.org/b"');
  });

  // --- The reason this renders React elements instead of HTML ---

  it("never emits a link for a non-http scheme", () => {
    // Forms lezer definitely parses as links, so the href really does reach
    // the renderer rather than falling through as literal text.
    const html = render("[a](javascript:alert) [b](file:///etc/passwd) [c](data:text/html,x) [d](vbscript:x)");

    // The property that matters: no anchor carries an unsafe scheme.
    expect(html).not.toMatch(/<a[^>]*href="(?!https?:|mailto:)/i);
    expect(html).not.toContain("<a ");

    // The labels survive as readable text.
    for (const label of ["a", "b", "c", "d"]) expect(html).toContain(label);
  });

  it("renders HTML in the model's answer as text, not markup", () => {
    const html = render('Before <script>alert(1)</script> and <img src=x onerror=alert(1)> after.');

    // No real element is produced for either — every angle bracket the model
    // wrote comes back escaped, so the attributes inside are inert text.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Before");
    expect(html).toContain("after.");
  });

  it("does not load images, showing the alt text instead", () => {
    const html = render("![a diagram](https://example.com/x.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain("a diagram");
  });

  // --- Streaming: half-written markup must not throw or vanish ---

  it("handles partial markup mid-stream", () => {
    const partial = "## Heading\n\nSome **bold that is not closed yet";
    expect(() => render(partial)).not.toThrow();
    expect(render(partial)).toContain("bold that is not closed yet");

    const openFence = "Intro text\n\n```js\nconst a = 1;";
    expect(() => render(openFence)).not.toThrow();
    expect(render(openFence)).toContain("const a = 1;");

    // Empty content renders an empty wrapper rather than throwing.
    expect(render("")).toMatch(/^<div class="[^"]*"><\/div>$/);
  });

  it("keeps plain prose intact", () => {
    const html = render("A sentence with no markup at all.");
    expect(html).toContain("A sentence with no markup at all.");
  });
});
