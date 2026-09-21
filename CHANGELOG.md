# Changelog

Version numbers just increase by one with each release — no semantic
versioning scheme. The version fields in `package.json`, `Cargo.toml`, and
`tauri.conf.json` store it as `N.0.0` for tooling compatibility, but every
release is referred to as "Version N".

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
