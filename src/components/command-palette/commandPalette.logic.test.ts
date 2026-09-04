import { describe, expect, it } from "vitest";
import { buildCommands, buildResultGroups, parentDirOf, type CommandContext, type FileResult, type FolderResult } from "./commandPalette.logic";

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    treeVisible: true,
    fileListVisible: true,
    rightSidebarVisible: true,
    createFile: () => {},
    createFolder: () => {},
    addRoot: () => {},
    setWritingMode: () => {},
    toggleTreeVisible: () => {},
    toggleFileListVisible: () => {},
    toggleRightSidebarVisible: () => {},
    setWidthPreset: () => {},
    requestExport: () => {},
    ...overrides,
  };
}

describe("parentDirOf", () => {
  it("returns the parent directory", () => {
    expect(parentDirOf("/a/b/c.md")).toBe("/a/b");
  });

  it("returns the root path itself when there's no parent", () => {
    expect(parentDirOf("/c.md")).toBe("/c.md");
  });
});

describe("buildCommands", () => {
  it("labels toggle commands by current visibility", () => {
    const commands = buildCommands(ctx({ treeVisible: true, fileListVisible: false, rightSidebarVisible: true }));
    expect(commands.find((c) => c.id === "toggle-folders")?.label).toBe("Hide Workspaces");
    expect(commands.find((c) => c.id === "toggle-files")?.label).toBe("Show Content");
    expect(commands.find((c) => c.id === "toggle-sidebar")?.label).toBe("Hide Sidebar");
  });
});

describe("buildResultGroups", () => {
  const folder: FolderResult = { type: "folder", name: "notes", path: "/root/notes", rootPath: "/root" };
  const rootFolder: FolderResult = { type: "folder", name: "root", path: "/root", rootPath: "/root" };
  const file: FileResult = { type: "file", name: "todo.md", path: "/root/notes/todo.md", rootPath: "/root" };

  it("hides New File/New Folder when no folder is selected", () => {
    const groups = buildResultGroups({
      query: "",
      commands: buildCommands(ctx()),
      navIndex: undefined,
      selectedFolderPath: null,
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: true,
      fileListVisible: true,
    });
    const createIds = groups.find((g) => g.label === "Create")?.items.map((i) => (i.type === "command" ? i.id : i));
    expect(createIds).not.toContain("new-file");
    expect(createIds).not.toContain("new-folder");
    expect(createIds).toContain("add-root");
  });

  it("hides Export commands when no file is selected", () => {
    const groups = buildResultGroups({
      query: "",
      commands: buildCommands(ctx()),
      navIndex: undefined,
      selectedFolderPath: "/root",
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: true,
      fileListVisible: true,
    });
    expect(groups.find((g) => g.label === "Export")).toBeUndefined();
  });

  it("hides toggle-sidebar in write mode", () => {
    const groups = buildResultGroups({
      query: "sidebar",
      commands: buildCommands(ctx()),
      navIndex: undefined,
      selectedFolderPath: null,
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: true,
      fileListVisible: true,
    });
    expect(groups.find((g) => g.label === "View")).toBeUndefined();
  });

  it("shows only root folders when the query is empty", () => {
    const groups = buildResultGroups({
      query: "",
      commands: [],
      navIndex: { folders: [rootFolder, folder], files: [file] },
      selectedFolderPath: null,
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: true,
      fileListVisible: true,
    });
    const folders = groups.find((g) => g.label === "Folders")?.items;
    expect(folders).toEqual([rootFolder]);
    expect(groups.find((g) => g.label === "Files")).toBeUndefined();
  });

  it("ranks and returns matching folders and files for a query", () => {
    const groups = buildResultGroups({
      query: "todo",
      commands: [],
      navIndex: { folders: [rootFolder, folder], files: [file] },
      selectedFolderPath: null,
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: true,
      fileListVisible: true,
    });
    expect(groups.find((g) => g.label === "Folders")).toBeUndefined();
    expect(groups.find((g) => g.label === "Files")?.items).toEqual([file]);
  });

  it("omits Folders/Files sections when their panels are hidden", () => {
    const groups = buildResultGroups({
      query: "todo",
      commands: [],
      navIndex: { folders: [rootFolder, folder], files: [file] },
      selectedFolderPath: null,
      selectedFilePath: null,
      writingMode: "write",
      treeVisible: false,
      fileListVisible: false,
    });
    expect(groups).toEqual([]);
  });
});
