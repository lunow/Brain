import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";

const PAGE_MARGIN = 56;

// Mirrors the app's own type scale (src/styles/tokens/typography.css):
// serif body+headings at a restrained ratio (h1/body ≈ 1.65, not a
// compounding step scale), sans for table chrome, mono for code — same
// families and proportions the editor uses, just in points instead of rem.
const BODY_SIZE = 10.5;
const LEADING_BODY = 1.55; // --leading-body, print-tuned down from 1.6
const LEADING_DISPLAY = 1.15; // --leading-display (h1/h2)
const LEADING_TIGHT = 1.3; // --leading-tight (h3–h6)
const LEADING_CODE = 1.45; // --leading-code
const CODE_INLINE_RATIO = 0.9; // --type-editor-code inline code is 0.9em of body
const TABLE_RATIO = 0.85; // .cm-mkTable is 0.85em of body, sans-serif

const BODY_LINE_HEIGHT = BODY_SIZE * LEADING_BODY;
const CODE_SIZE = BODY_SIZE * (15 / 17); // --type-editor-code / --type-editor-body
const CODE_LINE_HEIGHT = CODE_SIZE * LEADING_CODE;

const LIST_INDENT = 18;
const BULLET_GAP = 14;
const TEXT_COLOR: [number, number, number] = [26, 26, 26];
const QUOTE_COLOR: [number, number, number] = [110, 110, 110];
const CODE_BG: [number, number, number] = [242, 242, 242];
const CODE_TEXT_COLOR: [number, number, number] = [60, 60, 60];
const LINK_COLOR: [number, number, number] = [37, 99, 235];
const RULE_COLOR: [number, number, number] = [200, 200, 200];

// h1–h3 scale down from --type-editor-h1..h3 at the same ratio to body;
// h4–h6 match body exactly ("weight-differentiated from body", per the
// app's own comment) rather than stepping down further.
const HEADING_SIZE: Record<number, number> = {
  1: BODY_SIZE * (28 / 17),
  2: BODY_SIZE * (23 / 17),
  3: BODY_SIZE * (19 / 17),
  4: BODY_SIZE,
  5: BODY_SIZE,
  6: BODY_SIZE,
};
const HEADING_LEADING: Record<number, number> = {
  1: LEADING_DISPLAY,
  2: LEADING_DISPLAY,
  3: LEADING_TIGHT,
  4: LEADING_TIGHT,
  5: LEADING_TIGHT,
  6: LEADING_TIGHT,
};

interface Style {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  quote?: boolean;
  link?: string;
}

type Token =
  | { type: "word"; text: string; style: Style }
  | { type: "space" }
  | { type: "break" }
  | { type: "checkbox"; checked: boolean };

interface Ctx {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  pageHeight: number;
  contentRight: number;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntity(raw: string): string {
  return ENTITY_MAP[raw] ?? raw;
}

function findChild(node: SyntaxNode, name: string): SyntaxNode | null {
  let child = node.firstChild;
  while (child) {
    if (child.type.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

/** Reconstructs plain text + rich runs for an inline container node. Gaps
 *  between recognized children (e.g. the "bold" inside `**bold**`) carry no
 *  node of their own in the lezer tree, so literal text is recovered from
 *  the source between sibling spans rather than from any node's own text. */
function collectInlineRuns(node: SyntaxNode, source: string, style: Style): Token[] {
  const tokens: Token[] = [];
  let pos = node.from;
  let child = node.firstChild;
  while (child) {
    if (child.from > pos) pushText(tokens, source.slice(pos, child.from), style);
    tokens.push(...renderInlineChild(child, source, style));
    pos = child.to;
    child = child.nextSibling;
  }
  if (pos < node.to) pushText(tokens, source.slice(pos, node.to), style);
  return tokens;
}

function pushText(tokens: Token[], text: string, style: Style) {
  const pieces = text.split(/(\s+)/);
  for (const piece of pieces) {
    if (piece === "") continue;
    if (/^\s+$/.test(piece)) tokens.push({ type: "space" });
    else tokens.push({ type: "word", text: piece, style });
  }
}

function renderInlineChild(node: SyntaxNode, source: string, style: Style): Token[] {
  const name = node.type.name;
  if (name.endsWith("Mark") || name === "URL" || name === "LinkTitle" || name === "CodeInfo") {
    return [];
  }
  if (name === "TaskMarker") {
    const checked = /x/i.test(source.slice(node.from, node.to));
    return [{ type: "checkbox", checked }, { type: "space" }];
  }
  if (name === "HardBreak") return [{ type: "break" }];
  if (name === "Escape") return [{ type: "word", text: source.slice(node.from + 1, node.to), style }];
  if (name === "Entity") {
    return [{ type: "word", text: decodeEntity(source.slice(node.from, node.to)), style }];
  }
  if (name === "InlineCode") return collectInlineRuns(node, source, { code: true });
  if (name === "Emphasis") return collectInlineRuns(node, source, { ...style, italic: true });
  if (name === "StrongEmphasis") return collectInlineRuns(node, source, { ...style, bold: true });
  if (name === "Strikethrough") return collectInlineRuns(node, source, { ...style, strike: true });
  if (name === "Link" || name === "Autolink") {
    const urlNode = findChild(node, "URL");
    const href = urlNode ? source.slice(urlNode.from, urlNode.to) : "";
    return collectInlineRuns(node, source, { ...style, link: href });
  }
  if (name === "Image") {
    const label = collectInlineRuns(node, source, {})
      .filter((t): t is Extract<Token, { type: "word" }> => t.type === "word")
      .map((t) => t.text)
      .join(" ");
    return [{ type: "word", text: `[image: ${label || "untitled"}]`, style: { ...style, italic: true } }];
  }
  if (name === "HTMLTag" || name === "HTMLBlock" || name === "CommentBlock") return [];
  return collectInlineRuns(node, source, style);
}

function setFont(doc: jsPDF, style: Style, size: number) {
  if (style.code) {
    doc.setFont("courier", style.bold ? "bold" : "normal");
    doc.setFontSize(size * CODE_INLINE_RATIO);
    doc.setTextColor(...CODE_TEXT_COLOR);
    return;
  }
  const variant = style.bold && style.italic ? "bolditalic" : style.bold ? "bold" : style.italic ? "italic" : "normal";
  doc.setFont("times", variant);
  doc.setFontSize(size);
  if (style.link) doc.setTextColor(...LINK_COLOR);
  else if (style.quote) doc.setTextColor(...QUOTE_COLOR);
  else doc.setTextColor(...TEXT_COLOR);
}

function ensureSpace(ctx: Ctx, height: number) {
  if (ctx.y + height > ctx.pageHeight - PAGE_MARGIN) {
    ctx.doc.addPage();
    ctx.y = PAGE_MARGIN;
  }
}

/** Greedy word-wraps `tokens` at `leftX`/`ctx.contentRight`, drawing each
 *  wrapped line (with mixed bold/italic/code/link runs) as it's completed. */
function layoutAndDraw(tokens: Token[], ctx: Ctx, leftX: number, size: number, lineHeight: number) {
  const { doc } = ctx;
  const maxWidth = ctx.contentRight - leftX;
  let line: Token[] = [];
  let width = 0;
  const spaceWidth = () => {
    setFont(doc, {}, size);
    return doc.getTextWidth(" ");
  };

  function flush() {
    while (line.length && line[line.length - 1].type === "space") line.pop();
    if (line.length === 0) return;
    ensureSpace(ctx, lineHeight);
    let x = leftX;
    for (const token of line) {
      if (token.type === "space") {
        x += spaceWidth();
        continue;
      }
      if (token.type === "checkbox") {
        const box = checkboxSize(size);
        const top = ctx.y - box * 0.85;
        doc.setDrawColor(...TEXT_COLOR);
        doc.setLineWidth(0.8);
        if (token.checked) {
          doc.setFillColor(...TEXT_COLOR);
          doc.rect(x, top, box, box, "FD");
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(1);
          doc.line(x + box * 0.2, top + box * 0.55, x + box * 0.42, top + box * 0.78);
          doc.line(x + box * 0.42, top + box * 0.78, x + box * 0.82, top + box * 0.22);
        } else {
          doc.rect(x, top, box, box, "D");
        }
        doc.setLineWidth(0.2);
        x += box;
        continue;
      }
      if (token.type !== "word") continue;
      setFont(doc, token.style, size);
      const w = doc.getTextWidth(token.text);
      if (token.style.code) {
        doc.setFillColor(...CODE_BG);
        doc.rect(x - 1, ctx.y - size * 0.82, w + 2, size * 1.18, "F");
        setFont(doc, token.style, size);
      }
      if (token.style.link) doc.textWithLink(token.text, x, ctx.y, { url: token.style.link });
      else doc.text(token.text, x, ctx.y);
      if (token.style.strike) {
        doc.setDrawColor(...TEXT_COLOR);
        doc.line(x, ctx.y - size * 0.32, x + w, ctx.y - size * 0.32);
      }
      x += w;
    }
    doc.setTextColor(...TEXT_COLOR);
    ctx.y += lineHeight;
    line = [];
    width = 0;
  }

  for (const token of tokens) {
    if (token.type === "break") {
      flush();
      continue;
    }
    if (token.type === "space") {
      if (line.length === 0) continue;
      line.push(token);
      width += spaceWidth();
      continue;
    }
    let w: number;
    if (token.type === "checkbox") {
      w = checkboxSize(size);
    } else {
      setFont(doc, token.style, size);
      w = doc.getTextWidth(token.text);
    }
    if (width + w > maxWidth && line.some((t) => t.type === "word" || t.type === "checkbox")) flush();
    line.push(token);
    width += w;
  }
  flush();
}

function checkboxSize(fontSize: number): number {
  return fontSize * 0.85;
}

function codeBlockLines(node: SyntaxNode, source: string): { lines: string[]; lang: string } {
  const infoNode = findChild(node, "CodeInfo");
  const lang = infoNode ? source.slice(infoNode.from, infoNode.to) : "";
  if (node.type.name === "FencedCode") {
    const raw = source.slice(node.from, node.to).split("\n");
    return { lines: raw.slice(1, -1), lang };
  }
  // Indented CodeBlock: strip the leading 4-space (or tab) indent per line.
  const raw = source.slice(node.from, node.to).split("\n");
  return { lines: raw.map((l) => l.replace(/^(?: {4}|\t)/, "")), lang: "" };
}

function drawCodeBlock(node: SyntaxNode, source: string, ctx: Ctx, leftX: number) {
  const { doc } = ctx;
  const { lines } = codeBlockLines(node, source);
  ctx.y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(CODE_SIZE);
  for (const rawLine of lines) {
    ensureSpace(ctx, CODE_LINE_HEIGHT);
    const w = ctx.contentRight - leftX;
    doc.setFillColor(...CODE_BG);
    doc.rect(leftX - 4, ctx.y - CODE_SIZE * 0.82, w + 4, CODE_LINE_HEIGHT, "F");
    doc.setTextColor(...CODE_TEXT_COLOR);
    doc.setFont("courier", "normal");
    doc.setFontSize(CODE_SIZE);
    doc.text(rawLine, leftX, ctx.y);
    ctx.y += CODE_LINE_HEIGHT;
  }
  doc.setTextColor(...TEXT_COLOR);
  ctx.y += 6;
}

function tableRowText(row: SyntaxNode, source: string): string[] {
  const cells: string[] = [];
  let child = row.firstChild;
  while (child) {
    if (child.type.name === "TableCell") {
      const text = collectInlineRuns(child, source, {})
        .map((t) => (t.type === "word" ? t.text : t.type === "space" ? " " : ""))
        .join("")
        .trim();
      cells.push(text);
    }
    child = child.nextSibling;
  }
  return cells;
}

function drawTable(node: SyntaxNode, source: string, ctx: Ctx, leftX: number) {
  let head: string[] = [];
  const body: string[][] = [];
  let child = node.firstChild;
  while (child) {
    if (child.type.name === "TableHeader") head = tableRowText(child, source);
    else if (child.type.name === "TableRow") body.push(tableRowText(child, source));
    child = child.nextSibling;
  }
  autoTable(ctx.doc, {
    startY: ctx.y,
    margin: { left: leftX, right: ctx.pageWidth - ctx.contentRight },
    head: head.length ? [head] : undefined,
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: BODY_SIZE * TABLE_RATIO,
      textColor: TEXT_COLOR,
      lineColor: RULE_COLOR,
      cellPadding: 5,
    },
    headStyles: { fillColor: [240, 240, 240], textColor: TEXT_COLOR, fontStyle: "bold" },
  });
  const withAutoTable = ctx.doc as unknown as { lastAutoTable?: { finalY: number } };
  ctx.y = (withAutoTable.lastAutoTable?.finalY ?? ctx.y) + 12;
}

function headingLevel(name: string): number | null {
  const atx = /^ATXHeading([1-6])$/.exec(name);
  if (atx) return Number(atx[1]);
  const setext = /^SetextHeading([12])$/.exec(name);
  if (setext) return Number(setext[1]);
  return null;
}

function renderBlock(node: SyntaxNode, source: string, ctx: Ctx, leftX: number) {
  const name = node.type.name;
  const level = headingLevel(name);

  if (level !== null) {
    const size = HEADING_SIZE[level];
    ctx.y += level <= 2 ? 14 : 8;
    const tokens = collectInlineRuns(node, source, { bold: true });
    layoutAndDraw(tokens, ctx, leftX, size, size * HEADING_LEADING[level]);
    ctx.y += level <= 2 ? 6 : 4;
    return;
  }

  switch (name) {
    case "Paragraph": {
      const tokens = collectInlineRuns(node, source, {});
      layoutAndDraw(tokens, ctx, leftX, BODY_SIZE, BODY_LINE_HEIGHT);
      ctx.y += 6;
      return;
    }
    case "BulletList":
    case "OrderedList": {
      let item = node.firstChild;
      let index = 1;
      while (item) {
        if (item.type.name === "ListItem") renderListItem(item, source, ctx, leftX, name === "OrderedList", index);
        index += 1;
        item = item.nextSibling;
      }
      ctx.y += 4;
      return;
    }
    case "Blockquote": {
      const startY = ctx.y;
      ctx.y += 4;
      let child = node.firstChild;
      while (child) {
        if (child.type.name !== "QuoteMark") renderQuotedBlock(child, source, ctx, leftX + BULLET_GAP);
        child = child.nextSibling;
      }
      ctx.doc.setDrawColor(...RULE_COLOR);
      ctx.doc.setLineWidth(2);
      ctx.doc.line(leftX + 2, startY - 2, leftX + 2, ctx.y - 8);
      ctx.doc.setLineWidth(0.2);
      ctx.y += 4;
      return;
    }
    case "FencedCode":
    case "CodeBlock":
      drawCodeBlock(node, source, ctx, leftX);
      return;
    case "Table":
      drawTable(node, source, ctx, leftX);
      return;
    case "HorizontalRule": {
      ctx.y += 8;
      ensureSpace(ctx, 8);
      ctx.doc.setDrawColor(...RULE_COLOR);
      ctx.doc.line(leftX, ctx.y, ctx.contentRight, ctx.y);
      ctx.y += 14;
      return;
    }
    case "HTMLBlock":
    case "LinkReference":
    case "CommentBlock":
      return;
    default: {
      let child = node.firstChild;
      while (child) {
        renderBlock(child, source, ctx, leftX);
        child = child.nextSibling;
      }
    }
  }
}

/** Same as {@link renderBlock} but forces italic/gray quote styling onto
 *  paragraph-level text, since blockquote content is just nested blocks. */
function renderQuotedBlock(node: SyntaxNode, source: string, ctx: Ctx, leftX: number) {
  if (node.type.name === "Paragraph") {
    const tokens = collectInlineRuns(node, source, { italic: true, quote: true });
    layoutAndDraw(tokens, ctx, leftX, BODY_SIZE, BODY_LINE_HEIGHT);
    ctx.y += 6;
    return;
  }
  renderBlock(node, source, ctx, leftX);
}

function renderListItem(
  item: SyntaxNode,
  source: string,
  ctx: Ctx,
  leftX: number,
  ordered: boolean,
  index: number,
) {
  const marker = findChild(item, "ListMark");
  const markerText = ordered ? (marker ? source.slice(marker.from, marker.to) : `${index}.`) : "•";
  const contentX = leftX + LIST_INDENT;

  let first = true;
  let child = item.firstChild;
  while (child) {
    const cname = child.type.name;
    if (cname === "ListMark") {
      child = child.nextSibling;
      continue;
    }
    if (cname === "BulletList" || cname === "OrderedList") {
      renderBlock(child, source, ctx, contentX);
      child = child.nextSibling;
      continue;
    }
    if (first) {
      const tokens = collectInlineRuns(child, source, {});
      const startY = ctx.y;
      layoutAndDraw(tokens, ctx, contentX, BODY_SIZE, BODY_LINE_HEIGHT);
      setFont(ctx.doc, {}, BODY_SIZE);
      ctx.doc.setTextColor(...TEXT_COLOR);
      ctx.doc.text(markerText, leftX, startY);
      first = false;
    } else {
      renderBlock(child, source, ctx, contentX);
    }
    child = child.nextSibling;
  }
  ctx.y += 2;
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}

/** Renders a markdown document to a PDF and returns it as raw bytes. Covers
 *  headings, paragraphs, lists (incl. nested + task lists), blockquotes,
 *  fenced/indented code blocks, tables, rules, links, and inline emphasis.
 *  Images render as an `[image: alt]` placeholder rather than being
 *  embedded, and mermaid/HTML blocks are not rendered. */
export function markdownToPdfBytes(markdown: string, title: string): Uint8Array {
  const source = stripFrontmatter(markdown);
  const tree = markdownParser.configure([GFM]).parse(source);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setProperties({ title });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ctx: Ctx = {
    doc,
    y: PAGE_MARGIN,
    pageWidth,
    pageHeight,
    contentRight: pageWidth - PAGE_MARGIN,
  };

  let child = tree.topNode.firstChild;
  while (child) {
    renderBlock(child, source, ctx, PAGE_MARGIN);
    child = child.nextSibling;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...QUOTE_COLOR);
    doc.text(String(i), pageWidth / 2, pageHeight - PAGE_MARGIN / 2, { align: "center" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
