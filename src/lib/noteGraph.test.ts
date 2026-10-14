import { describe, expect, it } from "vitest";
import { buildNoteGraph, extractLinkTargets, noteName, type ScannedNote } from "./noteGraph";
import type { RootFolder } from "./tauri-commands";

const ROOTS: RootFolder[] = [{ id: "r1", path: "/vault", displayName: "Vault", addedAt: 0 }];

function note(path: string, content: string): ScannedNote {
  return { path, content };
}

describe("extractLinkTargets", () => {
  it("finds inline link targets in document order", () => {
    expect(extractLinkTargets("see [a](./a.md) and [b](b.md)")).toEqual(["./a.md", "b.md"]);
  });

  it("ignores images", () => {
    expect(extractLinkTargets("![cat](cat.png) [note](note.md)")).toEqual(["note.md"]);
  });

  it("unwraps angle-bracketed targets and drops titles", () => {
    expect(extractLinkTargets('[a](<my note.md>) [b](b.md "The B")')).toEqual(["my note.md", "b.md"]);
  });

  it("skips links inside fenced code blocks", () => {
    const content = ["before [real](real.md)", "```", "[fake](fake.md)", "```", "after [also](also.md)"].join("\n");
    expect(extractLinkTargets(content)).toEqual(["real.md", "also.md"]);
  });

  it("skips links inside tilde fences and unclosed fences", () => {
    expect(extractLinkTargets("~~~\n[fake](fake.md)\n~~~\n[real](real.md)")).toEqual(["real.md"]);
    expect(extractLinkTargets("[real](real.md)\n```\n[fake](fake.md)")).toEqual(["real.md"]);
  });

  it("skips links inside inline code", () => {
    expect(extractLinkTargets("`[fake](fake.md)` but [real](real.md)")).toEqual(["real.md"]);
  });

  it("does not let one unpaired backtick swallow the rest of the document", () => {
    const content = ["Cost is 5` per unit.", "", "See [real](./real.md) and [other](./other.md).", "", "Another ` here."].join("\n");
    expect(extractLinkTargets(content)).toEqual(["./real.md", "./other.md"]);
  });

  it("finds links whose text holds balanced brackets", () => {
    expect(extractLinkTargets("[![badge](b.png)](./target.md)")).toEqual(["./target.md"]);
    expect(extractLinkTargets("[see [1]](./a.md)")).toEqual(["./a.md"]);
  });

  it("does not let a backtick inside a fence swallow later links", () => {
    const content = ["```", "a ` stray backtick", "```", "[real](real.md)"].join("\n");
    expect(extractLinkTargets(content)).toEqual(["real.md"]);
  });

  it("returns duplicates, leaving de-duplication to the graph", () => {
    expect(extractLinkTargets("[a](a.md) [again](a.md)")).toEqual(["a.md", "a.md"]);
  });

  it("ignores empty targets", () => {
    expect(extractLinkTargets("[nothing]() [real](real.md)")).toEqual(["real.md"]);
  });
});

describe("noteName", () => {
  it("strips the markdown extension", () => {
    expect(noteName("/vault/Ideas/Big idea.md")).toBe("Big idea");
  });

  it("leaves non-markdown names alone", () => {
    expect(noteName("/vault/notes.backup")).toBe("notes.backup");
  });

  it("keeps dots inside a note name", () => {
    expect(noteName("/vault/v1.2 plan.md")).toBe("v1.2 plan");
  });
});

describe("buildNoteGraph", () => {
  it("makes one node per note", () => {
    const graph = buildNoteGraph([note("/vault/a.md", ""), note("/vault/b.md", "")], ROOTS);
    expect(graph.nodes.map((n) => n.path)).toEqual(["/vault/a.md", "/vault/b.md"]);
    expect(graph.edges).toEqual([]);
  });

  it("draws an edge for a relative link between two notes", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[b](./b.md)"), note("/vault/b.md", "")], ROOTS);
    expect(graph.edges).toEqual([{ source: "/vault/a.md", target: "/vault/b.md" }]);
  });

  it("resolves links across folders, including ..", () => {
    const graph = buildNoteGraph(
      [note("/vault/one/a.md", "[b](../two/b.md)"), note("/vault/two/b.md", "")],
      ROOTS,
    );
    expect(graph.edges).toEqual([{ source: "/vault/one/a.md", target: "/vault/two/b.md" }]);
  });

  it("resolves root-relative links against the containing workspace root", () => {
    const graph = buildNoteGraph(
      [note("/vault/deep/a.md", "[b](/two/b.md)"), note("/vault/two/b.md", "")],
      ROOTS,
    );
    expect(graph.edges).toEqual([{ source: "/vault/deep/a.md", target: "/vault/two/b.md" }]);
  });

  it("resolves a link that omits the .md extension", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[b](b)"), note("/vault/b.md", "")], ROOTS);
    expect(graph.edges).toEqual([{ source: "/vault/a.md", target: "/vault/b.md" }]);
  });

  it("ignores a #fragment when resolving", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[b](b.md#why)"), note("/vault/b.md", "")], ROOTS);
    expect(graph.edges).toEqual([{ source: "/vault/a.md", target: "/vault/b.md" }]);
  });

  it("does not draw external URLs", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[x](https://example.com)")], ROOTS);
    expect(graph.edges).toEqual([]);
    expect(graph.unresolvedCount).toBe(0);
  });

  it("does not draw a link to a note outside the vault", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[gone](./missing.md)")], ROOTS);
    expect(graph.edges).toEqual([]);
    expect(graph.unresolvedCount).toBe(1);
  });

  it("does not count a dead attachment link as a broken note link", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[pdf](./paper.pdf)")], ROOTS);
    expect(graph.unresolvedCount).toBe(0);
  });

  it("joins two notes once however many links run between them", () => {
    const graph = buildNoteGraph(
      [note("/vault/a.md", "[b](b.md) [b again](./b.md) [b#x](b.md#x)"), note("/vault/b.md", "[a](a.md)")],
      ROOTS,
    );
    expect(graph.edges).toEqual([{ source: "/vault/a.md", target: "/vault/b.md" }]);
  });

  it("ignores a note linking to itself", () => {
    const graph = buildNoteGraph([note("/vault/a.md", "[me](a.md)")], ROOTS);
    expect(graph.edges).toEqual([]);
    expect(graph.nodes[0].degree).toBe(0);
  });

  it("counts degree as links in plus links out", () => {
    const graph = buildNoteGraph(
      [
        note("/vault/hub.md", "[a](a.md) [b](b.md)"),
        note("/vault/a.md", ""),
        note("/vault/b.md", "[hub](hub.md) [a](a.md)"),
      ],
      ROOTS,
    );
    const degree = (path: string) => graph.nodes.find((n) => n.path === path)!.degree;
    expect(degree("/vault/hub.md")).toBe(2);
    expect(degree("/vault/a.md")).toBe(2);
    expect(degree("/vault/b.md")).toBe(2);
    expect(graph.edges).toHaveLength(3);
  });

  it("spans multiple workspace roots, resolving each root-relative link in its own root", () => {
    const roots: RootFolder[] = [
      { id: "r1", path: "/one", displayName: "One", addedAt: 0 },
      { id: "r2", path: "/two", displayName: "Two", addedAt: 0 },
    ];
    const graph = buildNoteGraph(
      [note("/one/a.md", "[x](/x.md)"), note("/one/x.md", ""), note("/two/b.md", "[x](/x.md)"), note("/two/x.md", "")],
      roots,
    );
    expect(graph.edges).toEqual([
      { source: "/one/a.md", target: "/one/x.md" },
      { source: "/two/b.md", target: "/two/x.md" },
    ]);
  });

  it("drops a root-relative link written in a file outside every root", () => {
    const graph = buildNoteGraph([note("/elsewhere/a.md", "[b](/b.md)"), note("/vault/b.md", "")], ROOTS);
    expect(graph.edges).toEqual([]);
  });
});
