/// Folder names every recursive walk skips, alongside the dotfile rule the
/// walks already apply.
///
/// A workspace is just a folder on disk, so a checked-out project inside one
/// drags its dependencies in with it. In a real vault a single `node_modules`
/// contributed 782 of 1188 markdown files — package READMEs, LICENSEs and
/// CHANGELOGs, none of them anybody's notes, and most of their links broken
/// because they point at files the package doesn't ship. Build output is the
/// same story. These are also the folders with the most entries to walk, so
/// skipping them is what keeps a workspace with a website in it usable.
pub const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "vendor",
    "target",
    "dist",
    "build",
    "coverage",
    "__pycache__",
];

pub fn is_ignored_dir(name: &str) -> bool {
    IGNORED_DIRS.contains(&name)
}
