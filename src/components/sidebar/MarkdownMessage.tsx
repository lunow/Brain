import { Fragment, useMemo, type ReactNode } from "react";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import type { SyntaxNode, Tree } from "@lezer/common";
import { openUrl } from "@tauri-apps/plugin-opener";
import styles from "./MarkdownMessage.module.css";

/**
 * Renders an agent's markdown answer.
 *
 * Built on @lezer/markdown — the same parser the editor's live preview and
 * the PDF export already use, so there's no second markdown dialect in the
 * app and no new dependency.
 *
 * It produces React elements directly rather than an HTML string. That is a
 * deliberate choice: this renders model output, and going through
 * dangerouslySetInnerHTML would make any `<script>` or `<img onerror=…>` the
 * model emitted into live markup. Building elements means tags in the
 * response can only ever be text.
 *
 * Streaming is handled by being cheap rather than incremental: answers are a
 * few kB and the parse is memoized per content string, so re-parsing on each
 * delta is not worth optimising away. Half-finished markup mid-stream (an
 * unclosed `**`, a fence still being written) simply renders as what it
 * currently is and resolves itself as more text arrives.
 */

const parser = markdownParser.configure([GFM]);

/** Bare URLs the model wrote as text, so http/https links still work even
 *  when it didn't use markdown link syntax. */
const BARE_URL = /(https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"])/g;

function isSafeHref(href: string): boolean {
  // Anything that isn't plainly http(s) or mailto is rendered as text. The
  // model is untrusted input; javascript:, data: and file: have no business
  // being one click away in a sidebar.
  const trimmed = href.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("mailto:");
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className={styles.link}
      href={href}
      onClick={(e) => {
        // Nothing should navigate the app's own webview away from itself.
        e.preventDefault();
        openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

/** Splits plain text on bare URLs, linking them and leaving the rest alone. */
function linkifyText(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const start = match.index ?? 0;
    if (start > lastIndex) out.push(text.slice(lastIndex, start));
    const url = match[0];
    out.push(
      <ExternalLink key={`${keyPrefix}-url-${start}`} href={url}>
        {url}
      </ExternalLink>,
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/**
 * Renders a node's inline children, emitting the source text of any gap
 * between them so plain runs aren't dropped.
 *
 * `skip` names child types that are consumed but not rendered — the syntax
 * markers, and a link's URL. Consuming rather than ignoring them is what
 * strips `**` from `**bold**`; it also has to work for constructs whose
 * markers are not symmetric, like a heading's single leading `##`, which is
 * why this walks the children rather than slicing between the first and
 * last marker.
 */
function inlineChildren(
  node: SyntaxNode,
  source: string,
  key: string,
  skip: (name: string) => boolean = (name) => name.endsWith("Mark"),
): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = node.from;
  let index = 0;

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > cursor) {
      out.push(...linkifyText(source.slice(cursor, child.from), `${key}-${index}`));
    }
    if (!skip(child.type.name)) {
      const rendered = renderInlineNode(child, source, `${key}-${index++}`);
      if (rendered !== null) out.push(rendered);
    }
    cursor = Math.max(cursor, child.to);
  }

  if (cursor < node.to) {
    out.push(...linkifyText(source.slice(cursor, node.to), `${key}-tail`));
  }
  return out;
}

/** Inline content with the surrounding syntax markers removed. */
function innerText(node: SyntaxNode, source: string, key: string): ReactNode[] {
  return inlineChildren(node, source, key);
}

/** A link's or image's visible label: markers and the URL both dropped. */
function labelOf(node: SyntaxNode, source: string, key: string): ReactNode[] {
  return inlineChildren(
    node,
    source,
    key,
    (name) => name.endsWith("Mark") || name === "URL" || name === "LinkTitle",
  );
}

/** Leading whitespace left behind by a consumed marker (`## ` -> `Findings`). */
function trimLeading(nodes: ReactNode[]): ReactNode[] {
  if (nodes.length > 0 && typeof nodes[0] === "string") {
    const trimmed = (nodes[0] as string).replace(/^[ \t]+/, "");
    return trimmed ? [trimmed, ...nodes.slice(1)] : nodes.slice(1);
  }
  return nodes;
}

function renderInlineNode(node: SyntaxNode, source: string, key: string): ReactNode {
  const type = node.type.name;

  switch (type) {
    case "Emphasis":
      return <em key={key}>{innerText(node, source, key)}</em>;
    case "StrongEmphasis":
      return <strong key={key}>{innerText(node, source, key)}</strong>;
    case "Strikethrough":
      return <del key={key}>{innerText(node, source, key)}</del>;
    case "InlineCode":
      return (
        <code key={key} className={styles.inlineCode}>
          {innerText(node, source, key)}
        </code>
      );
    case "Link": {
      const urlNode = node.getChild("URL");
      const href = urlNode ? source.slice(urlNode.from, urlNode.to) : "";
      const label = labelOf(node, source, key);
      if (!isSafeHref(href)) return <Fragment key={key}>{label}</Fragment>;
      return (
        <ExternalLink key={key} href={href}>
          {label}
        </ExternalLink>
      );
    }
    case "URL":
    case "Autolink": {
      const href = source.slice(node.from, node.to).replace(/^<|>$/g, "");
      if (!isSafeHref(href)) return <Fragment key={key}>{href}</Fragment>;
      return (
        <ExternalLink key={key} href={href}>
          {href}
        </ExternalLink>
      );
    }
    case "Image": {
      // Images are not loaded — a model-supplied URL would be a network
      // request made on its say-so. The alt text carries the meaning.
      const alt = labelOf(node, source, key);
      return (
        <span key={key} className={styles.image}>
          {alt.length > 0 ? alt : "image"}
        </span>
      );
    }
    case "HTMLTag":
    case "Entity":
      // Rendered as the literal source. See the file comment.
      return <Fragment key={key}>{source.slice(node.from, node.to)}</Fragment>;
    case "HardBreak":
      return <br key={key} />;
    default:
      if (type.endsWith("Mark")) return null;
      return <Fragment key={key}>{source.slice(node.from, node.to)}</Fragment>;
  }
}

function listItems(node: SyntaxNode, source: string, key: string): ReactNode[] {
  const items: ReactNode[] = [];
  let index = 0;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.type.name !== "ListItem") continue;
    const itemKey = `${key}-li${index++}`;

    // A GFM task item is shaped ListItem > Task > TaskMarker, with the text
    // living directly in Task and no Paragraph of its own — so it needs its
    // own branch rather than falling through to renderBlocks, which would
    // find no block child and emit an empty bullet.
    const task = child.getChild("Task");
    const marker = task?.getChild("TaskMarker") ?? null;
    if (task && marker) {
      const checked = source.slice(marker.from, marker.to).toLowerCase().includes("x");
      items.push(
        <li key={itemKey} className={styles.taskItem}>
          <input type="checkbox" className={styles.checkbox} checked={checked} readOnly />
          <span>{trimLeading(inlineChildren(task, source, itemKey, (name) => name === "TaskMarker"))}</span>
        </li>,
      );
      continue;
    }

    items.push(<li key={itemKey}>{renderBlocks(child, source, itemKey, true)}</li>);
  }
  return items;
}

function renderTable(node: SyntaxNode, source: string, key: string): ReactNode {
  const header: ReactNode[] = [];
  const rows: ReactNode[][] = [];

  for (let child = node.firstChild; child; child = child.nextSibling) {
    const name = child.type.name;
    if (name !== "TableHeader" && name !== "TableRow") continue;
    const cells: ReactNode[] = [];
    let cellIndex = 0;
    for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
      if (cell.type.name !== "TableCell") continue;
      cells.push(
        <Fragment key={`${key}-c${cellIndex}`}>{inlineChildren(cell, source, `${key}-c${cellIndex}`)}</Fragment>,
      );
      cellIndex++;
    }
    if (name === "TableHeader") header.push(...cells);
    else rows.push(cells);
  }

  return (
    <div key={key} className={styles.tableWrap}>
      <table className={styles.table}>
        {header.length > 0 && (
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, c) => (
                <td key={c}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders the block-level children of `node`. */
function renderBlocks(node: SyntaxNode, source: string, key: string, tight = false): ReactNode[] {
  const out: ReactNode[] = [];
  let index = 0;

  for (let child = node.firstChild; child; child = child.nextSibling) {
    const type = child.type.name;
    const childKey = `${key}-${index++}`;

    if (type.startsWith("ATXHeading") || type.startsWith("SetextHeading")) {
      const level = Number(type.slice(-1)) || 1;
      const Tag = (`h${Math.min(level, 6)}`) as "h1";
      out.push(
        <Tag key={childKey} className={styles.heading} data-level={level}>
          {trimLeading(innerText(child, source, childKey))}
        </Tag>,
      );
    } else if (type === "Paragraph") {
      // Inside a tight list item the paragraph wrapper only adds margins.
      out.push(
        tight ? (
          <Fragment key={childKey}>{inlineChildren(child, source, childKey)}</Fragment>
        ) : (
          <p key={childKey}>{inlineChildren(child, source, childKey)}</p>
        ),
      );
    } else if (type === "BulletList") {
      out.push(
        <ul key={childKey} className={styles.list}>
          {listItems(child, source, childKey)}
        </ul>,
      );
    } else if (type === "OrderedList") {
      out.push(
        <ol key={childKey} className={styles.list}>
          {listItems(child, source, childKey)}
        </ol>,
      );
    } else if (type === "FencedCode" || type === "CodeBlock") {
      const textNodes: string[] = [];
      for (let c = child.firstChild; c; c = c.nextSibling) {
        if (c.type.name === "CodeText") textNodes.push(source.slice(c.from, c.to));
      }
      const body =
        textNodes.length > 0 ? textNodes.join("") : source.slice(child.from, child.to).replace(/^```.*\n?|```$/g, "");
      out.push(
        <pre key={childKey} className={styles.codeBlock}>
          <code>{body.replace(/\n$/, "")}</code>
        </pre>,
      );
    } else if (type === "Blockquote") {
      out.push(
        <blockquote key={childKey} className={styles.quote}>
          {renderBlocks(child, source, childKey)}
        </blockquote>,
      );
    } else if (type === "HorizontalRule") {
      out.push(<hr key={childKey} className={styles.rule} />);
    } else if (type === "Table") {
      out.push(renderTable(child, source, childKey));
    } else if (type === "Task") {
      out.push(
        <Fragment key={childKey}>
          {trimLeading(inlineChildren(child, source, childKey, (name) => name === "TaskMarker"))}
        </Fragment>,
      );
    } else if (type === "ListItem") {
      // Only reached via renderBlocks on a list item's own children.
      out.push(...renderBlocks(child, source, childKey, tight));
    }
  }

  return out;
}

export function MarkdownMessage({ content }: { content: string }) {
  const rendered = useMemo(() => {
    if (!content) return null;
    const tree: Tree = parser.parse(content);
    return renderBlocks(tree.topNode, content, "b");
  }, [content]);

  return <div className={styles.markdown}>{rendered}</div>;
}
