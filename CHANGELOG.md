# Changelog

Version numbers just increase by one with each release — no semantic
versioning scheme. The version fields in `package.json`, `Cargo.toml`, and
`tauri.conf.json` store it as `N.0.0` for tooling compatibility, but every
release is referred to as "Version N".

## Version 6

**Ideate**

- The research agent's answers now render as markdown instead of raw text —
  headings, lists, tables, task lists, code blocks, quotes and links all
  come out formatted. Links open in your browser; images are never fetched,
  so the alt text stands in for them. Your own messages stay exactly as you
  typed them.

**Layout**

- The page has breathing room above and below it in the normal view, so it
  reads as a sheet sitting on a surface rather than starting flush under
  the toolbar. Fullscreen is unchanged.
- The Workspaces column no longer prints the shared parent folder as a
  heading above a group of workspaces. The ordering is the same; the path
  is just not shown.

**Development**

- `pnpm demo` launches the app against a set of fictional demo workspaces
  for screenshots, leaving your real workspace list untouched. It works
  through `BRAIN_WORKSPACE_STORE`, which points the app at a different
  workspace file inside its own data directory.

## Version 5

A redesign of the three-column layout, and a new typeface for the writing
area.

**Content column**

- The file list is now a real folder tree: disclosure chevrons, an icon on
  every file, and no preview sub-line under each name. Folders come first
  at every level, then files, each ordered naturally by name — so
  "Chapter 2" sorts before "Chapter 10" rather than after it.
- Drag and drop moves both files *and* folders into any folder. Dropping
  onto the tree's background moves an entry back out to the workspace
  root. A folder can't be dropped into itself or into one of its own
  subfolders.
- Double-click a folder to rename it, the same as files already did.
- Right-click a folder for New File, New Folder, Rename, Reveal in Finder
  and Delete; right-click the empty space below the tree to create at the
  workspace root. New File and New Folder buttons sit in the column header.
- Arrow keys walk the whole tree: up/down through every visible row, right
  to open a folder or step into it, left to close it or step back out to
  its parent, Home/End for the ends. Focus is shown with a ring and is
  deliberately separate from the selection — Enter opens the focused file.
- Jumping to a file from `⌘K` now opens every folder between the workspace
  root and that file and scrolls it into view, instead of re-rooting the
  column onto the file's parent folder (which also left the Workspaces
  column with nothing selected).
- The per-row separator lines are gone; nesting is carried by indentation
  and one guide line per open folder.
- The "include subfolders" toggle has been removed — a collapsed folder
  already hides its contents, which is all it did.

**Typography**

- The writing area is set in Charter, a crisper screen serif than the
  previous New York, at a slightly larger reading size.
- Headings now follow the law of proximity: the space above a heading is
  larger than the space below it, so a heading groups with the text it
  introduces instead of floating between two blocks. Scaled by level — an
  h1 gets a longer run-up than an h4.
- Paragraph spacing is tighter, so a run of paragraphs reads as one block
  of thought. The last paragraph before a heading, a list, or the end of
  the document keeps a little more room to close the group off. Blank
  lines inside fenced code, frontmatter, tables and quotes are untouched.

**Layout**

- The window opens larger (1680×1000), and the writing column is wider —
  a 1000px page, centered in its pane with even margins rather than sitting
  flush against the Content column.
- The Workspaces and Content columns are wider too, enough for a
  workspace's path and stats line and for a dated filename one level deep.
- All three column headers share one baseline grid, so their labels line
  up across the window.
- Switching width presets (`⇧⌘1/2/3`) no longer animates.
- The current workspace shows an open folder icon.

**Editor**

- A file edited by another program now folds into the open document in
  place, keeping your scroll position, cursor and undo history, instead of
  reloading the editor from the top. If the file has unsaved changes you
  still get the conflict banner.

**Fixes**

- A short document now fills the full height of the writing pane. It
  previously stopped short of the bottom, leaving a strip of the canvas
  showing below it.
- Wide tables no longer run past the right edge of the writing pane.

## Version 4

**Sidebar**

- Double-click a file or workspace folder to rename it inline. `⌘⇧R` renames
  the selected file (or, with no file open, the selected workspace folder),
  and "Rename File" is available in the command palette.
- Files can now be dragged onto subfolders in the Content column, not just
  onto workspace roots. The target folder expands after the drop so the
  moved file stays in view.

**App**

- A small version badge sits in the top-right corner of the title bar.
- The `brain` command-line launcher now ships inside the app bundle
  (`Brain.app/Contents/Resources/bin/brain`); symlink it into your `PATH`
  once and it keeps working across updates. See the README.

## Version 3

**Editor**

- Reworked typewriter scrolling so it only kicks in while you're typing
  across multiple rows. Clicking around, fixing a word here and there,
  marking text, arrow-key navigation, paste, and undo/redo no longer move
  the page.
- The active line now stays wherever it is on screen when you start
  typing, instead of being pulled to a fixed 60% mark — scroll the line to
  where you want it, and it stays there as new rows come in.
- Scrolling the page yourself while typing always wins: the next keystroke
  simply picks up the cursor's new position.

**Export**

- New "Copy to clipboard" option in the export menu and the Cmd+K palette
  (Export section) — puts the file's markdown source on the clipboard.

## Version 2

**CLI**

- `brain <folder>` from a terminal opens that folder as a workspace root —
  works for a fresh launch and for a launch while Brain is already running.

**Editor**

- Fixed the editor's typewriter-scroll effect fighting mouse drag-selection
  and Shift+Arrow keyboard selection, which could spike the scroll position
  to the top of the document mid-selection.
- Fixed the scroll position jumping after editing a table cell.
- Fixed a layout jump when a horizontal rule (`---`) line was selected —
  it no longer swaps between its rendered line and raw text.
- Fixed markdown formatting (`##`, `**`, etc.) sometimes staying unrendered
  on a freshly opened file until an edit or selection change forced a
  refresh.
- Tables no longer stretch to fill the full pane width when their content
  doesn't need it; wide tables still get the full pane and scroll
  horizontally.
- Removed the outline/focus-ring artifacts shown while editing a table
  cell.
- Disabled scroll-bounce (rubber-banding) everywhere except the main
  writing area, and contained the writing area's own bounce so it no
  longer drags the rest of the window along with it.

**Window & layout**

- Fixed the window briefly showing a blank grey flash when returning to
  Brain after it sat in the background for a while.
- The native window title now shows a breadcrumb of the current
  workspace, folder path, and open file (e.g. `Notes → 2026 → today`).
- Added a silver title bar strip separating the native title area from
  the app's own header row.
- The Workspaces and Content column headers now stay fixed in place while
  their lists scroll underneath, instead of scrolling away.
- Squared off the selected workspace row's background instead of rounding
  it, with a thin top/bottom border.

## Version 1

- Initial release: a fast, minimalistic markdown reader/editor for macOS.
