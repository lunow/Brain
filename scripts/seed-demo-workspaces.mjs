#!/usr/bin/env node
/**
 * Stages the demo/screenshot environment:
 *
 *   1. Builds `demo-workspaces/` — four fictional vaults sharing one parent
 *      folder, so the Workspaces column shows several roots under a grouped
 *      subheader. Only "Atlas of Quiet Places" holds real content; the other
 *      three carry just enough files to make their stats lines read as a
 *      lived-in vault rather than an empty one.
 *   2. Writes `workspace.demo.json` into the app's data directory, listing
 *      those four as roots.
 *
 * The real `workspace.json` is never read or written. The app only picks the
 * demo file up when launched with BRAIN_WORKSPACE_STORE=workspace.demo.json,
 * which is what `pnpm demo` does.
 *
 * Re-runnable: the vault contents are only generated where missing, so your
 * own edits to the demo files survive. Pass --force to rebuild them.
 */
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACES = path.join(REPO, "demo-workspaces");
const RICH = path.join(WORKSPACES, "Atlas of Quiet Places");
const LEGACY_RICH = path.join(REPO, "demo-vault");
const APP_DATA = path.join(os.homedir(), "Library", "Application Support", "io.lun.brain");
const DEMO_STORE = path.join(APP_DATA, "workspace.demo.json");
const FORCE = process.argv.includes("--force");

const DAY = 86_400_000;

/** Sparse vaults. Content is deliberately thin — these exist to populate the
 *  Workspaces column, not to be opened. `age` backdates every file so the
 *  "last change" line reads plausibly instead of "just now". */
const SPARSE = [
  {
    name: "Field Journal",
    ageDays: 3,
    files: {
      "README.md": "# Field Journal\n\nDated entries from trips. Raw; nothing here is drafted.\n",
      "2026/april.md": "# April\n\nThree days on the coast. Notes transferred to the Atlas research folder.\n",
      "2026/march.md": "# March\n\nNorthern trip. Long walks, little writing.\n",
      "2026/february.md": "# February\n\nLibrary week. Mostly reading.\n",
      "2025/december.md": "# December\n\nNothing much. Weather.\n",
    },
  },
  {
    name: "Reading Notes",
    ageDays: 11,
    files: {
      "README.md": "# Reading Notes\n\nOne file per book. Quotations and arguments, kept separate from the drafting.\n",
      "architecture/the-eyes-of-the-skin.md": "# The Eyes of the Skin\n\nOn the other senses in architecture. Useful for the chapel chapter.\n",
      "architecture/towards-a-new-architecture.md": "# Towards a New Architecture\n\nRead for the room-as-instrument argument. Did not find it.\n",
      "landscape/the-old-ways.md": "# The Old Ways\n\nPaths as records of use. Directly relevant to the Orkney note.\n",
      "landscape/the-living-mountain.md": "# The Living Mountain\n\nThe standard against which the Atlas will be measured, fairly or not.\n",
      "method/on-writing-well.md": "# On Writing Well\n\nRe-read annually. Still right about adverbs.\n",
    },
  },
  {
    name: "Archive 2025",
    ageDays: 240,
    files: {
      "README.md": "# Archive 2025\n\nClosed work. Kept for reference, not edited.\n",
      "pitches/atlas-proposal.md": "# Atlas — proposal\n\nThe version that sold the book. Superseded by the current outline.\n",
      "pitches/unused-series-idea.md": "# Unused series idea\n\nShelved. Revisit if the Atlas does well.\n",
      "admin/2025-contracts.md": "# Contracts 2025\n\nSummary only; the signed copies are not in this vault.\n",
    },
  },
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Walks a tree setting every file's mtime, so folder stats read as history. */
async function backdate(root, ageDays) {
  const when = new Date(Date.now() - ageDays * DAY);
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const full = path.join(entry.parentPath ?? entry.path, entry.name);
      await fs.utimes(full, when, when);
    }
  }
}

/**
 * Brain registers tauri-plugin-single-instance, so launching it while a copy
 * is already running hands the arguments to the running one and exits. That
 * copy has whatever environment IT was started with — so the demo launch
 * would quietly end up showing the real workspaces instead of the demo ones,
 * with no error anywhere. Catch it here rather than let it look like the
 * store override failed.
 */
function runningInstances() {
  try {
    const out = execSync("pgrep -fl 'target/(debug|release)/brain|Brain.app/Contents/MacOS'", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return []; // pgrep exits non-zero when nothing matches
  }
}

async function main() {
  const running = runningInstances();
  if (running.length > 0 && !process.argv.includes("--allow-running")) {
    console.error("\nBrain is already running:\n");
    for (const line of running) console.error(`  ${line}`);
    console.error(
      [
        "",
        "Quit it first. Because of tauri-plugin-single-instance, a second launch",
        "hands off to the running copy and exits, so the demo workspaces would",
        "never appear — the existing window keeps its own environment.",
        "",
        "  pkill -f 'target/debug/brain' && pnpm demo",
        "",
        "Pass --allow-running to seed the files anyway without launching.",
        "",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(WORKSPACES, { recursive: true });

  // The rich vault was first generated at demo-vault/; fold it in rather
  // than regenerating, so any edits made to it are kept.
  if (!(await exists(RICH)) && (await exists(LEGACY_RICH))) {
    await fs.rename(LEGACY_RICH, RICH);
    console.log("moved demo-vault/ -> demo-workspaces/Atlas of Quiet Places/");
  }
  if (!(await exists(RICH))) {
    console.error(
      "missing: demo-workspaces/Atlas of Quiet Places/ — the rich vault is not generated by this script",
    );
    process.exitCode = 1;
    return;
  }

  for (const vault of SPARSE) {
    const root = path.join(WORKSPACES, vault.name);
    if ((await exists(root)) && !FORCE) {
      console.log(`kept    ${vault.name} (exists; --force to rebuild)`);
    } else {
      for (const [relative, body] of Object.entries(vault.files)) {
        const file = path.join(root, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, body, "utf-8");
      }
      console.log(`wrote   ${vault.name} (${Object.keys(vault.files).length} files)`);
    }
    await backdate(root, vault.ageDays);
  }

  // The rich vault reads as the one actively being worked on.
  await backdate(RICH, 0);

  const roots = [
    { name: "Atlas of Quiet Places", ageDays: 0 },
    ...SPARSE.map((v) => ({ name: v.name, ageDays: v.ageDays })),
  ].map((v, i) => ({
    id: `demo${i + 1}`,
    path: path.join(WORKSPACES, v.name),
    displayName: v.name,
    addedAt: Date.now() - (v.ageDays + 30) * DAY,
  }));

  await fs.mkdir(APP_DATA, { recursive: true });
  await fs.writeFile(DEMO_STORE, JSON.stringify({ roots }, null, 2), "utf-8");

  console.log(`\nseeded  ${DEMO_STORE}`);
  console.log(`        ${roots.length} roots, real workspace.json untouched`);
}

await main();
