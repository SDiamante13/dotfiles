#!/usr/bin/env node

// Deterministic AGENTS.md quality audit.
// Analyzes signal-to-noise ratio, instruction budget, redundancy, and anti-patterns.
//
// Usage: node roast-audit.js [repo-path]
// Output: JSON report for the roast skill to consume

const fs = require("fs");
const path = require("path");

const repoPath = path.resolve(process.argv[2] || ".");

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function findAIConfigFiles(dir, depth = 0) {
  const files = [];
  const names = [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".windsurfrules",
    ".clinerules",
    "aicm.json",
  ];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fileExists(p)) files.push(p);
  }
  const copilot = path.join(dir, ".github", "copilot-instructions.md");
  if (fileExists(copilot)) files.push(copilot);

  // Check .cursor/rules/
  const cursorRulesDir = path.join(dir, ".cursor", "rules");
  try {
    const entries = fs.readdirSync(cursorRulesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) files.push(path.join(cursorRulesDir, e.name));
    }
  } catch {}

  // Recurse into packages/*/
  if (depth < 2) {
    for (const sub of ["packages", "apps", "services", "libs"]) {
      const subDir = path.join(dir, sub);
      try {
        const entries = fs.readdirSync(subDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            files.push(...findAIConfigFiles(path.join(subDir, e.name), depth + 1));
          }
        }
      } catch {}
    }
  }
  return files;
}

function getPackageJsonScripts(dir) {
  const content = readFile(path.join(dir, "package.json"));
  if (!content) return {};
  try {
    return JSON.parse(content).scripts || {};
  } catch {
    return {};
  }
}

function countInstructions(content) {
  const lines = content.split("\n").filter((l) => l.trim());
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("|") && trimmed.includes("---")) continue;
    if (trimmed.startsWith("<!--")) continue;
    if (/^(- |[0-9]+\.|>\s|\*\s)/.test(trimmed)) {
      count++;
      continue;
    }
    if (
      /\b(always|never|must|should|don't|do not|use|prefer|avoid|run|ensure|make sure)\b/i.test(
        trimmed
      )
    ) {
      count++;
    }
  }
  return count;
}

function detectLLMFingerprints(content) {
  const signals = [];
  if (/this (project|repository|codebase) (uses|is|contains|follows)/i.test(content))
    signals.push("generic-opener");
  if (/## (Overview|Introduction|About|Getting Started)\b/i.test(content))
    signals.push("formulaic-sections");
  if (/you are (a|an) (expert|helpful|senior|experienced)/i.test(content))
    signals.push("identity-prompt");
  if (/follow(ing)? best practices/i.test(content)) signals.push("vague-advice");
  if (/ensure (code )?quality/i.test(content)) signals.push("vague-advice");
  if (/write clean (and )?(maintainable )?code/i.test(content)) signals.push("vague-advice");
  if (/use meaningful (variable )?names/i.test(content)) signals.push("common-sense");
  if (/add comments (to|for|where)/i.test(content)) signals.push("common-sense");
  if (/handle errors (properly|gracefully|appropriately)/i.test(content))
    signals.push("vague-advice");

  // Check for uniform section lengths (LLM fingerprint)
  const sections = content.split(/^## /m).filter(Boolean);
  if (sections.length >= 4) {
    const lengths = sections.map((s) => s.split("\n").length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / lengths.length;
    const cv = Math.sqrt(variance) / avg;
    if (cv < 0.3) signals.push("uniform-section-lengths");
  }

  return {
    signals,
    isLikelyGenerated: signals.length >= 3,
    score: signals.length,
  };
}

function detectStyleRules(content) {
  const patterns = [
    { pattern: /\b(indent|indentation)\b.*\b(spaces?|tabs?)\b/i, label: "indentation" },
    { pattern: /\b(camelCase|PascalCase|snake_case|kebab-case)\b/i, label: "naming-convention" },
    {
      pattern: /\b(semicolons?|trailing comma|single quotes?|double quotes?)\b/i,
      label: "formatting",
    },
    { pattern: /\b(max.?line.?length|line.?width|col.?limit)\b/i, label: "line-length" },
    { pattern: /\b(import order|sort imports|import grouping)\b/i, label: "import-order" },
    {
      pattern: /\b(blank lines?|empty lines?|whitespace)\b.*\b(between|after|before)\b/i,
      label: "whitespace",
    },
    { pattern: /\b(curly brace|brace style|opening brace)\b/i, label: "brace-style" },
  ];
  const found = [];
  for (const { pattern, label } of patterns) {
    if (pattern.test(content)) found.push(label);
  }
  return found;
}

function getPackageJsonDeps(dir) {
  const content = readFile(path.join(dir, "package.json"));
  if (!content) return [];
  try {
    const pkg = JSON.parse(content);
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  } catch {
    return [];
  }
}

function detectRedundancy(content, scripts, dir) {
  const redundant = [];
  const scriptNames = Object.keys(scripts);
  for (const name of scriptNames) {
    const cmd = scripts[name];
    if (content.includes(cmd) || content.includes(`npm run ${name}`) || content.includes(`yarn ${name}`)) {
      redundant.push({ type: "package-json-script", name, command: cmd, discoveryCost: "trivial" });
    }
  }

  // Check for directory structure descriptions
  const structurePatterns = [
    /```\n(src|lib|packages|apps)\//m,
    /## (Project |Directory |Folder |File )?(Structure|Layout|Organization)/i,
    /├──|└──|│\s+├/,
  ];
  for (const p of structurePatterns) {
    if (p.test(content)) {
      redundant.push({ type: "directory-structure", discoveryCost: "trivial" });
      break;
    }
  }

  // Check for tech stack enumeration (3+ techs that appear in package.json deps)
  const deps = getPackageJsonDeps(dir || repoPath);
  if (deps.length > 0) {
    const techKeywords = [
      { name: "React", dep: "react" },
      { name: "Next.js", dep: "next" },
      { name: "Vue", dep: "vue" },
      { name: "Angular", dep: "@angular/core" },
      { name: "Svelte", dep: "svelte" },
      { name: "Express", dep: "express" },
      { name: "Fastify", dep: "fastify" },
      { name: "TypeScript", dep: "typescript" },
      { name: "Tailwind", dep: "tailwindcss" },
      { name: "Prisma", dep: "prisma" },
      { name: "tRPC", dep: "@trpc/server" },
      { name: "GraphQL", dep: "graphql" },
      { name: "Jest", dep: "jest" },
      { name: "Vitest", dep: "vitest" },
      { name: "Playwright", dep: "@playwright/test" },
      { name: "Cypress", dep: "cypress" },
      { name: "Redux", dep: "redux" },
      { name: "Zustand", dep: "zustand" },
      { name: "MongoDB", dep: "mongodb" },
      { name: "PostgreSQL", dep: "pg" },
    ];
    const mentioned = techKeywords.filter(
      (t) => new RegExp(`\\b${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(content) && deps.some((d) => d === t.dep)
    );
    if (mentioned.length >= 3) {
      redundant.push({
        type: "tech-stack-enumeration",
        techs: mentioned.map((t) => t.name),
        discoveryCost: "trivial",
      });
    }
  }

  return redundant;
}

function detectCommandScope(content) {
  const hasFullBuild =
    /\b(npm run build|yarn build|pnpm build|make build)\b/i.test(content);
  const hasFileScopedTypecheck =
    /\btsc\b.*--noEmit\b.*\b\w+\.(ts|tsx)\b/i.test(content) ||
    /\btsc --noEmit\b/i.test(content);
  const hasFileScopedLint =
    /\beslint\b.*\b\w+\.(ts|tsx|js)\b/i.test(content) ||
    /\bprettier\b.*--check\b/i.test(content);
  const hasFileScopedTest =
    /\b(jest|vitest|pytest)\b.*\b\w+\.(spec|test)\b/i.test(content);

  return {
    hasFullBuild,
    hasFileScopedTypecheck,
    hasFileScopedLint,
    hasFileScopedTest,
    hasAnyFileScoped: hasFileScopedTypecheck || hasFileScopedLint || hasFileScopedTest,
  };
}

// Duplicated in agents-md/scripts/audit.js — keep both in sync
function detectInitDump(content) {
  const signals = [];
  const lines = content.split("\n");
  const first30 = lines.slice(0, 30).join("\n");

  if (/^#+\s*(this (project|repository)|overview)/im.test(content))
    signals.push("generic-project-opener");
  if (/this (project|repository) (is a|contains|is built)/i.test(content))
    signals.push("this-project-is-sentence");

  const techListMatch = content.match(
    /\b(React|Next\.js|Vue|Angular|Svelte|Express|Fastify|TypeScript|Tailwind|Prisma|tRPC|GraphQL|PostgreSQL|MongoDB|Redis|Docker|Kubernetes)\b/gi
  );
  if (techListMatch && techListMatch.length >= 5)
    signals.push("exhaustive-tech-enumeration");

  if (/[├└│]──/.test(first30) || /```\n?(src|lib|packages|apps)\//m.test(first30))
    signals.push("directory-tree-early");

  const hasOverview = /## (Overview|About|Introduction)\b/i.test(content);
  const hasGettingStarted = /## (Getting Started|Setup|Installation)\b/i.test(content);
  const hasProjectStructure = /## (Project Structure|Directory|File Structure|Folder Structure)\b/i.test(content);
  if (hasOverview && hasGettingStarted && hasProjectStructure)
    signals.push("init-section-trifecta");

  return {
    signals,
    // 3 of 5 possible signals — threshold chosen to avoid false positives on
    // files that merely have an overview section or mention several techs
    isLikelyInitDump: signals.length >= 3,
    score: signals.length,
  };
}

function countFilesContaining(dir, pattern, extensions, maxDepth, limit) {
  let count = 0;
  function walk(d, depth) {
    if (depth > maxDepth || count >= limit) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (count >= limit) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(full, depth + 1);
      } else if (e.isFile() && extensions.some((ext) => e.name.endsWith(ext))) {
        try {
          const src = fs.readFileSync(full, "utf-8");
          if (pattern.test(src)) count++;
        } catch {}
      }
    }
  }
  walk(dir, 0);
  return count;
}

function detectAnchoringTraps(content, dir) {
  const traps = [];
  const techPatterns = [
    { name: "tRPC", pattern: /\btrpc\b/i },
    { name: "GraphQL", pattern: /\bgraphql\b/i },
    { name: "Prisma", pattern: /\bprisma\b/i },
    { name: "Redux", pattern: /\bredux\b/i },
    { name: "MobX", pattern: /\bmobx\b/i },
    { name: "Zustand", pattern: /\bzustand\b/i },
    { name: "Tailwind", pattern: /\btailwind\b/i },
    { name: "Styled Components", pattern: /\bstyled[.-]components\b/i },
    { name: "Emotion", pattern: /\b@?emotion\b/i },
    { name: "Jest", pattern: /\bjest\b/i },
    { name: "Vitest", pattern: /\bvitest\b/i },
    { name: "Cypress", pattern: /\bcypress\b/i },
    { name: "Playwright", pattern: /\bplaywright\b/i },
  ];

  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  // Check src/, app/, lib/ — common source directories
  const sourceDirs = ["src", "app", "lib"].map((d) => path.join(dir, d));
  const validSourceDirs = sourceDirs.filter((d) => {
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  });
  if (validSourceDirs.length === 0) return traps;

  for (const { name, pattern } of techPatterns) {
    if (!pattern.test(content)) continue;
    const mentionCount = (content.match(new RegExp(pattern.source, "gi")) || []).length;
    let importCount = 0;
    for (const srcDir of validSourceDirs) {
      importCount += countFilesContaining(srcDir, pattern, extensions, 4, 20);
      if (importCount >= 5) break;
    }
    if (importCount < 5) {
      traps.push({ tech: name, mentionCount, importCount, ratio: importCount / Math.max(mentionCount, 1) });
    }
  }
  return traps;
}

function detectUnconditionalAlways(content) {
  const lines = content.split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    // Strip markdown list markers and bold formatting before matching
    const body = lines[i].trim()
      .replace(/^(?:[-*]\s+|\d+\.\s+)/, "")
      .replace(/^\*{1,2}(.*?)\*{1,2}/, "$1")
      .trim();
    if (!body) continue;
    if (!/^(always|never|every time|for all|in all cases)\b/i.test(body)) continue;
    if (/\b(when|if|unless|except)\b/i.test(body)) continue;
    matches.push({ line: i + 1, text: body });
  }
  return matches;
}

function detectMonolith(analyses, nestedCount) {
  // Check AGENTS.md first; only fall back to CLAUDE.md if it has real content (not a pointer)
  const agentsMd = analyses.find((f) => f.path === "AGENTS.md");
  if (agentsMd) return agentsMd.lines > 100 && nestedCount === 0;
  const claudeMd = analyses.find((f) => f.path === "CLAUDE.md");
  if (!claudeMd) return false;
  // Skip pointer files (typically <10 lines with just "@AGENTS.md" or a link)
  if (claudeMd.lines < 10) return false;
  return claudeMd.lines > 100 && nestedCount === 0;
}

function detectHotfixAppenditis(content) {
  const lines = content.split("\n");
  const total = lines.length;
  if (total < 20) return { detected: false };

  const lastQuarter = lines.slice(Math.floor(total * 0.75));
  const narrowPatterns = [
    /\b(note|important|remember|don't forget|also|update|fix)\b.*:/i,
    /^-\s+(always|never|make sure|don't)\b/i,
    /^>\s/,
  ];
  let narrowCount = 0;
  for (const line of lastQuarter) {
    if (narrowPatterns.some((p) => p.test(line.trim()))) narrowCount++;
  }
  return {
    detected: narrowCount > lastQuarter.length * 0.4,
    narrowInstructionsInLastQuarter: narrowCount,
    lastQuarterLines: lastQuarter.length,
  };
}

function analyzeFile(filePath) {
  const symlink = isSymlink(filePath);
  // Skip symlinked CLAUDE.md — it's the same content as AGENTS.md, avoid double-counting
  if (symlink && path.basename(filePath) === "CLAUDE.md") {
    return {
      path: path.relative(repoPath, filePath),
      isSymlink: true,
      skipped: true,
      lines: 0,
      nonEmptyLines: 0,
      chars: 0,
      estimatedTokens: 0,
      instructionCount: 0,
      llmFingerprints: { signals: [], isLikelyGenerated: false, score: 0 },
      initDump: { signals: [], isLikelyInitDump: false, score: 0 },
      anchoringTraps: [],
      unconditionalAlways: [],
      styleRules: [],
      redundancy: [],
      commandScope: { hasFullBuild: false, hasFileScopedTypecheck: false, hasFileScopedLint: false, hasFileScopedTest: false, hasAnyFileScoped: false },
      hotfixAppenditis: { detected: false },
    };
  }

  const content = readFile(filePath);
  if (!content) return null;

  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim()).length;
  const chars = content.length;
  const estimatedTokens = Math.round(chars * 0.3);

  const dir = path.dirname(filePath);
  const scripts = getPackageJsonScripts(dir) || getPackageJsonScripts(repoPath);

  return {
    path: path.relative(repoPath, filePath),
    isSymlink: symlink,
    lines: lines.length,
    nonEmptyLines,
    chars,
    estimatedTokens,
    instructionCount: countInstructions(content),
    llmFingerprints: detectLLMFingerprints(content),
    initDump: detectInitDump(content),
    anchoringTraps: detectAnchoringTraps(content, dir),
    unconditionalAlways: detectUnconditionalAlways(content),
    styleRules: detectStyleRules(content),
    redundancy: detectRedundancy(content, scripts, dir),
    commandScope: detectCommandScope(content),
    hotfixAppenditis: detectHotfixAppenditis(content),
  };
}

// Main
const configFiles = findAIConfigFiles(repoPath);
const analyses = configFiles.map(analyzeFile).filter(Boolean);

const totalLines = analyses.reduce((a, f) => a + f.lines, 0);
const totalTokens = analyses.reduce((a, f) => a + f.estimatedTokens, 0);
const totalInstructions = analyses.reduce((a, f) => a + f.instructionCount, 0);

const allStyleRules = [...new Set(analyses.flatMap((f) => f.styleRules))];
const allLLMSignals = [...new Set(analyses.flatMap((f) => f.llmFingerprints.signals))];
const anyLikelyGenerated = analyses.some((f) => f.llmFingerprints.isLikelyGenerated);
const anyInitDump = analyses.some((f) => f.initDump.isLikelyInitDump);
const allAnchoringTraps = analyses.flatMap((f) => f.anchoringTraps);
const totalUnconditionalAlways = analyses.reduce((a, f) => a + f.unconditionalAlways.length, 0);
const anyFullBuildOnly = analyses.some(
  (f) => f.commandScope.hasFullBuild && !f.commandScope.hasAnyFileScoped
);
const anyHotfixAppenditis = analyses.some((f) => f.hotfixAppenditis.detected);
const totalRedundancies = analyses.reduce((a, f) => a + f.redundancy.length, 0);

// Nested AGENTS.md count (scan packages/, apps/, services/, libs/)
let nestedAgentsMdCount = 0;
for (const sub of ["packages", "apps", "services", "libs"]) {
  const subDir = path.join(repoPath, sub);
  try {
    const entries = fs.readdirSync(subDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const nested = path.join(subDir, e.name, "AGENTS.md");
        try { if (fs.statSync(nested).isFile()) nestedAgentsMdCount++; } catch {}
      }
    }
  } catch {}
}

const isMonolith = detectMonolith(analyses, nestedAgentsMdCount);

const sins = [];
if (anyLikelyGenerated) sins.push("llm-generated-content");
if (anyInitDump) sins.push("init-dump");
if (allAnchoringTraps.length > 0) sins.push("anchoring-trap");
if (totalUnconditionalAlways > 3) sins.push("unconditional-always");
if (isMonolith) sins.push("monolith-no-depth");
if (totalInstructions > 150) sins.push("instruction-budget-overrun");
if (allStyleRules.length > 0) sins.push("style-rules-as-instructions");
if (anyFullBuildOnly) sins.push("full-build-only");
if (anyHotfixAppenditis) sins.push("hotfix-appenditis");
if (totalRedundancies > 0) sins.push("redundant-content");

// Estimate noise tokens from per-file analysis
const noiseLineCount = analyses.reduce((sum, f) => {
  let noise = 0;
  // Redundancy: each item ~5 lines of noise on average
  noise += f.redundancy.length * 5;
  // LLM-generated files are ~60% noise
  if (f.llmFingerprints.isLikelyGenerated) noise += Math.round(f.nonEmptyLines * 0.6);
  // Init dumps are ~70% noise
  if (f.initDump.isLikelyInitDump) noise += Math.round(f.nonEmptyLines * 0.7);
  // Style rules: ~3 lines each
  noise += f.styleRules.length * 3;
  return sum + Math.min(noise, f.nonEmptyLines);
}, 0);
const totalNonEmptyLines = analyses.reduce((a, f) => a + f.nonEmptyLines, 0);
const noiseRatio = totalNonEmptyLines > 0 ? noiseLineCount / totalNonEmptyLines : 0;
const noiseTokens = Math.round(totalTokens * noiseRatio);
const estimatedDailyRequests = 50;
const estimatedMonthlyCost = Number(((noiseTokens / 1_000_000) * 3 * 30 * estimatedDailyRequests).toFixed(2));

const allRedundancies = analyses.flatMap((f) => f.redundancy);
const redundancyByTier = { trivial: 0, moderate: 0, expensive: 0 };
for (const r of allRedundancies) {
  const tier = r.discoveryCost || "trivial";
  redundancyByTier[tier] = (redundancyByTier[tier] || 0) + 1;
}

const report = {
  repoPath,
  summary: {
    configFileCount: analyses.length,
    totalLines,
    totalTokens,
    totalInstructions,
    instructionBudgetUsed: `${totalInstructions}/~100`,
    overBudget: totalInstructions > 100,
    noiseTokens,
    estimatedDailyRequests,
    estimatedMonthlyCost,
    redundancyByTier,
  },
  detectedSins: sins,
  files: analyses,
  aggregated: {
    styleRulesFound: allStyleRules,
    llmSignals: allLLMSignals,
    anyLikelyGenerated,
    anyInitDump,
    anchoringTraps: allAnchoringTraps,
    totalUnconditionalAlways,
    isMonolith,
    anyFullBuildOnly,
    anyHotfixAppenditis,
    totalRedundancies,
  },
};

console.log(JSON.stringify(report, null, 2));