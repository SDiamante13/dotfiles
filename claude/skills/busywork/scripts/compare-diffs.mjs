#!/usr/bin/env node
// compare-diffs.mjs — replay-mode scoring for busywork.
//
// Given a replay base commit, a human merge commit, and a bot worktree, compute
// a comparison between the bot's uncommitted/committed changes against origin
// and the human's merged diff. Emit one JSONL row to the output file.
//
// Usage:
//   node compare-diffs.mjs \
//     --subrepo /path/to/subrepo \
//     --replay-base <sha> \
//     --human-merge-commit <sha> \
//     --bot-worktree /path/to/worktree \
//     --ticket DRIVE-15876 \
//     --output /abs/path/report.jsonl

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function arg(name) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function required(name) {
  const v = arg(name);
  if (!v) {
    console.error(`Missing required --${name}`);
    process.exit(2);
  }
  return v;
}

function run(cmd, cwd) {
  return execSync(cmd, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
}

function safeRun(cmd, cwd) {
  try {
    return { ok: true, out: run(cmd, cwd) };
  } catch (err) {
    return { ok: false, out: "", err: err.message || String(err) };
  }
}

function changedFiles(cwd, range) {
  const r = safeRun(`git diff --name-only ${range}`, cwd);
  if (!r.ok) return [];
  return r.out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function linesChanged(cwd, range) {
  const r = safeRun(`git diff --shortstat ${range}`, cwd);
  if (!r.ok) return 0;
  // format: " 3 files changed, 120 insertions(+), 45 deletions(-)"
  const ins = /(\d+) insertion/.exec(r.out);
  const del = /(\d+) deletion/.exec(r.out);
  return (ins ? +ins[1] : 0) + (del ? +del[1] : 0);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  const intersection = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : intersection / union;
}

function setDiff(a, b) {
  const sb = new Set(b);
  return a.filter((x) => !sb.has(x));
}

function classifySummary({ jaccardFiles, locRatio, testsPassed }) {
  if (!testsPassed) return "failed";
  if (jaccardFiles >= 0.7 && locRatio >= 0.3 && locRatio <= 3.0)
    return "within-range";
  return "divergent";
}

function runTestsInWorktree(cwd) {
  // Detect test command from package.json. Fall back to a conservative "unknown → treat as failed".
  const pkgRun = safeRun("cat package.json", cwd);
  if (!pkgRun.ok) return false;
  let pkg;
  try {
    pkg = JSON.parse(pkgRun.out);
  } catch {
    return false;
  }
  const scripts = (pkg && pkg.scripts) || {};
  const cmd = scripts.test
    ? "npm test --silent"
    : scripts["test:unit"]
      ? "npm run test:unit --silent"
      : null;
  if (!cmd) return false;
  const r = safeRun(cmd, cwd);
  return r.ok;
}

function main() {
  const subrepo = required("subrepo");
  const replayBase = required("replay-base");
  const humanMergeCommit = required("human-merge-commit");
  const botWorktree = required("bot-worktree");
  const ticket = required("ticket");
  const output = required("output");

  if (!existsSync(output)) {
    mkdirSync(dirname(output), { recursive: true });
  }

  // Human diff: replay-base...human-merge-commit evaluated in the canonical subrepo.
  const humanRange = `${replayBase}..${humanMergeCommit}`;
  const humanFiles = changedFiles(subrepo, humanRange);
  const humanLoc = linesChanged(subrepo, humanRange);

  // Bot diff: whatever the bot produced on its worktree — both committed and uncommitted, vs replay-base.
  // The bot may or may not have committed; include both surfaces.
  const botCommittedRange = `${replayBase}..HEAD`;
  const botFilesCommitted = changedFiles(botWorktree, botCommittedRange);
  const botFilesWorking = (() => {
    const r = safeRun("git status --porcelain", botWorktree);
    if (!r.ok) return [];
    return r.out
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
  })();
  const botFiles = [...new Set([...botFilesCommitted, ...botFilesWorking])];
  const botLoc = linesChanged(botWorktree, botCommittedRange);

  const jaccardFiles = jaccard(humanFiles, botFiles);
  const locRatio = humanLoc === 0 ? (botLoc === 0 ? 1 : Infinity) : botLoc / humanLoc;
  const missedPaths = setDiff(humanFiles, botFiles);
  const extraPaths = setDiff(botFiles, humanFiles);
  const testsPassed = runTestsInWorktree(botWorktree);

  const scoring = {
    jaccard_files: Number.isFinite(jaccardFiles) ? jaccardFiles : 0,
    loc_ratio: Number.isFinite(locRatio) ? locRatio : 999,
    missed_paths: missedPaths,
    extra_paths: extraPaths,
    tests_passed: testsPassed,
  };

  const row = {
    ts: new Date().toISOString(),
    ticket,
    human_mr_commit: humanMergeCommit,
    replay_base: replayBase,
    human_files_changed: humanFiles.length,
    human_loc_changed: humanLoc,
    bot_files_changed: botFiles.length,
    bot_loc_changed: botLoc,
    scoring,
    summary: classifySummary({
      jaccardFiles,
      locRatio,
      testsPassed,
    }),
  };

  appendFileSync(output, JSON.stringify(row) + "\n");
  console.log(
    `[compare-diffs] ${ticket} → ${row.summary} | jaccard=${row.scoring.jaccard_files.toFixed(
      2,
    )} locRatio=${Number.isFinite(row.scoring.loc_ratio) ? row.scoring.loc_ratio.toFixed(2) : "inf"} tests=${row.scoring.tests_passed}`,
  );
}

try {
  main();
} catch (err) {
  console.error(`[compare-diffs] error: ${err.message || err}`);
  process.exit(1);
}