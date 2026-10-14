import type { RootFolder } from "./tauri-commands";
import { resolveLocalLink } from "./notePaths";

/**
 * The note graph: one node per markdown file in the open workspaces, one
 * edge per link between two of them.
 *
 * Edges come from the markdown links already in the vault — the same
 * `[text](./other-note.md)` references the editor opens on ⌘-click, resolved
 * through `notePaths.resolveLocalLink` so the two can't drift apart. A link
 * that leaves the vault (an http URL, an attachment, a note that doesn't
 * exist yet) is not an edge: every edge joins two nodes that are both really
 * there, so the graph never shows a connection you can't follow.
 */

export interface GraphNode {
  path: string;
  /** Basename without the markdown extension — what's drawn as the label. */
  name: string;
  /** Links in plus links out. Drives node size, so well-connected notes read
   *  as hubs the way they do in Obsidian. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface NoteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Local links that pointed at nothing in the vault. Not drawn, but worth
   *  reporting: a vault full of them means broken links, not a sparse graph. */
  unresolvedCount: number;
}

export interface ScannedNote {
  path: string;
  content: string;
}

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkd"];

/* Inline code spans, stripped after the fenced blocks: links inside code are
   being shown as text, not followed, so they aren't edges. Indented (4-space)
   code blocks are not stripped — that indentation is far more often a nested
   list, whose links are real.

   Applied one line at a time (see extractLinkTargets). Run over the whole
   document it would span paragraphs, so a single unpaired backtick — a stray
   "5` per unit" — swallowed every link up to the next stray backtick and
   silently dropped those edges. A code span can't contain a blank line
   anyway, and per-line keeps one bad backtick from costing more than its own
   line. */
const INLINE_CODE = /(`+)(?:[^`\n]|(?!\1)`)*\1/g;

/** Opening or closing fence line, capturing the run of fence characters. */
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Drops fenced code blocks, line by line. A regex can't do this safely: the
 * unclosed-fence case needs an end-of-input anchor, and JS only has `$`,
 * which under the `m` flag matches at every line end — so a closed fence
 * ended early and re-opened on its own closing line, swallowing the rest of
 * the document. An unterminated fence runs to the end of the file, the way
 * the markdown parser treats it.
 */
function stripFencedCode(content: string): string {
  const kept: string[] = [];
  let fence: string | null = null;

  for (const line of content.split("\n")) {
    const match = FENCE_LINE.exec(line);
    if (fence === null) {
      if (match) fence = match[1];
      else kept.push(line);
      continue;
    }
    // Closes only on the same fence character, at least as long as the opener.
    if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
  }

  return kept.join("\n");
}

/* [text](target), with an optional <>-wrapped target and an optional title.
   The leading (!)? captures images — `![alt](cat.png)` embeds a file rather
   than linking to a note, so those are dropped.

   The link text allows one level of nested brackets, which is what the two
   common shapes need: a badge link `[![alt](badge.png)](./note.md)` and
   bracketed text `[see [1]](./note.md)`. Both are followable in the editor,
   so the graph has to see them too — flat text made them draw no edge at
   all. Deeper nesting is rare enough to leave to the editor. */
const INLINE_LINK =
  /(!?)\[(?:[^[\]\\]|\\.|\[(?:[^[\]\\]|\\.)*\])*\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;

/** Separator for the undirected edge key. A NUL can't occur in a path. */
const EDGE_KEY_SEP = "\0";

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function noteName(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 && isMarkdownPath(base) ? base.slice(0, dot) : base;
}

/**
 * Link targets written in a markdown document, in document order and
 * including duplicates. Targets are raw hrefs — resolving them to paths is
 * `resolveLocalLink`'s job.
 */
export function extractLinkTargets(content: string): string[] {
  const prose = stripFencedCode(content)
    .split("\n")
    .map((line) => line.replace(INLINE_CODE, ""))
    .join("\n");

  const out: string[] = [];
  let match: RegExpExecArray | null;
  INLINE_LINK.lastIndex = 0;
  while ((match = INLINE_LINK.exec(prose))) {
    if (match[1] === "!") continue; // an image, not a link to a note
    let target = match[2];
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (target) out.push(target);
  }
  return out;
}

/**
 * Builds the graph from already-read note contents.
 *
 * Takes the notes rather than reading them so it stays pure and testable;
 * `useNoteGraph` does the I/O.
 */
export function buildNoteGraph(notes: ScannedNote[], roots: RootFolder[]): NoteGraph {
  const byPath = new Map<string, GraphNode>();
  for (const note of notes) {
    byPath.set(note.path, { path: note.path, name: noteName(note.path), degree: 0 });
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  let unresolvedCount = 0;

  for (const note of notes) {
    for (const href of extractLinkTargets(note.content)) {
      const resolved = resolveLocalLink(href, note.path, roots);
      if (resolved === null) continue; // external URL — not part of the vault

      // A link may omit the extension ("[see](ideas)"), the way Obsidian's
      // own links do; try the literal path first, then the markdown file it
      // most likely meant.
      const target = byPath.has(resolved)
        ? resolved
        : MARKDOWN_EXTENSIONS.map((ext) => resolved + ext).find((p) => byPath.has(p));

      if (!target) {
        // Only count a miss as a broken note link if it could have been one:
        // a dead link to an image or a PDF is a different kind of problem.
        const base = resolved.slice(resolved.lastIndexOf("/") + 1);
        if (isMarkdownPath(resolved) || !base.includes(".")) unresolvedCount++;
        continue;
      }
      if (target === note.path) continue; // a note linking to itself

      // Two notes are joined once however many links run between them, and
      // direction doesn't change the line that gets drawn.
      const key =
        note.path < target ? note.path + EDGE_KEY_SEP + target : target + EDGE_KEY_SEP + note.path;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      edges.push({ source: note.path, target });
      byPath.get(note.path)!.degree++;
      byPath.get(target)!.degree++;
    }
  }

  return { nodes: [...byPath.values()], edges, unresolvedCount };
}
