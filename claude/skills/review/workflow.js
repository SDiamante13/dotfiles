export const meta = {
  name: 'review-analysis',
  description: 'Deep-review orchestration for core:review Step 2 + 4.5: per-changed-file architectural analysis fan-out (one Explore agent per file), then an N-skeptic adversarial-verify panel that votes to kill/downgrade each draft finding and surfaces MISSES. Returns the surviving findings + the misses for the interactive skill to reconcile with the user.',
  phases: [
    { title: 'Analyze', detail: 'per-changed-file architectural analysis fan-out (Opus, one agent per file)' },
    { title: 'Adversarial', detail: 'N-skeptic verify panel — kill/downgrade votes + MISSES (Opus)' },
    { title: 'Tally', detail: 'consensus vote → surviving + downgraded + missed findings (Haiku)' },
  ],
}

// ---------------------------------------------------------------------------
// args: {
//   repoRoot: "<abs repo root>",
//   changedFiles: ["src/Foo.java", ...],   // from `git diff --name-only`
//   diff: "<unified diff text>",            // the diff being reviewed (incremental or fresh)
//   draftFindings?: "<Steps 3+4 findings text>",  // test-quality + code-quality scan results to feed the panel
//   skeptics?: <int>,                       // panel size; default 3
// }
// The SKILL.md only invokes this AFTER the user opts in to Step 2. The opt-in
// gate, the Phase 1/Phase 2 conversational reconcile, and the post-review
// refactor+verify pair all stay in the SKILL.md — this script is Step 2 + 4.5 only.
// ---------------------------------------------------------------------------
const REPO_ROOT = (args && args.repoRoot) || '.'
const CHANGED_FILES = (args && Array.isArray(args.changedFiles) ? args.changedFiles : []).filter(Boolean)
const DRAFT_FINDINGS = (args && args.draftFindings) || '(no Step 3/4 draft findings supplied)'
const SKEPTICS = (args && Number.isInteger(args.skeptics) && args.skeptics > 0) ? args.skeptics : 3

// Mandatory checks — VERBATIM from the original skill (Step 2).
const MANDATORY_CHECKS =
  '**Apply these mandatory checks** (read the relevant sections of ~/Dev/context/team/standards/code-review-checklist.md if present; if missing, note it and continue with best-effort checks):\n' +
  '- **Library-Contract Verification** — for any new use of Micrometer / Spring `@Transactional` / `@Async` / `@Scheduled` / Jackson / awspring. Cross-reference ~/Dev/context/team/standards/library-gotchas.md for known traps (if missing, note it). Use mcp__plugin_context7_context7 if the contract is unclear; if the MCP tool is unavailable, flag the unclear contract for the user to verify manually.\n' +
  '- **Concurrency Model Walkthrough** — mandatory for any `@Scheduled`, queue consumer, polling loop, batch job. Explicitly trace lock/idempotency lifetime through the call graph (don\'t just confirm primitives exist).\n' +
  '- **Wire-Format Parity** — if any publish/serialize/output path is being migrated (legacy → outbox, sync → async, etc.), verify byte-equivalence to the legacy path.\n' +
  '- **Test-Backed AC Verification** — for any AC asserting a runtime guarantee, a primitive being present in code is not coverage. Confirm a test exercises the failure mode.'

// Reviewer Self-Checkpoint — VERBATIM from the original skill (Step 2).
const SELF_CHECKPOINT =
  '**Apply the Reviewer Self-Checkpoint:** before marking ANY item ✅, ask "What\'s the gotcha someone burned by this API/pattern would look for?" If you can\'t articulate the gotcha and confirm the code dodges it, the ✅ is unearned. Verify and earn it, downgrade to ⚠️, or skip and say so explicitly.'

// Pre-report verification discipline — VERBATIM from the original skill (Step 2).
const PRE_REPORT_DISCIPLINE =
  'Be specific. Cite method names and line numbers. Read the actual code, don\'t theorize.\n' +
  'Before reporting a bug: verify the issue is in the diff (not pre-existing), read the full\n' +
  'method body, and grep for callers before raising "dead code" or "wrong caller" concerns.'

const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['concerns', 'simplifications', 'looksGood'],
  properties: {
    concerns: {
      type: 'array',
      description: 'Architectural concerns (incl. library contracts, concurrency, wire format)',
      items: {
        type: 'object', additionalProperties: false,
        required: ['concern', 'location', 'proof', 'fixOptions'],
        properties: {
          concern: { type: 'string' },
          location: { type: 'string', description: 'file:line' },
          proof: { type: 'string', description: 'one-paragraph proof, not a hand-wave' },
          fixOptions: { type: 'string' },
        },
      },
    },
    simplifications: {
      type: 'array',
      description: 'Simplification wins',
      items: {
        type: 'object', additionalProperties: false,
        required: ['opportunity', 'location', 'what'],
        properties: {
          opportunity: { type: 'string' },
          location: { type: 'string', description: 'file:method' },
          what: { type: 'string', description: 'what could be done' },
        },
      },
    },
    looksGood: {
      type: 'array',
      description: 'Looks good (with the gotcha verified-dodged)',
      items: {
        type: 'object', additionalProperties: false,
        required: ['item', 'location', 'gotcha'],
        properties: {
          item: { type: 'string', description: "what's well done" },
          location: { type: 'string', description: 'file:method' },
          gotcha: { type: 'string', description: 'the gotcha it avoids, in one phrase' },
        },
      },
    },
  },
}

const PANEL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['misses', 'downgrades', 'cleanPass'],
  properties: {
    misses: {
      type: 'array',
      description: 'MISSES (must add to the review)',
      items: {
        type: 'object', additionalProperties: false,
        required: ['location', 'claim', 'proof', 'fixOptions'],
        properties: {
          location: { type: 'string', description: 'file:line' },
          claim: { type: 'string', description: 'one-line claim' },
          proof: { type: 'string', description: 'proof in 2-4 sentences citing the actual code' },
          fixOptions: { type: 'string', description: 'fix options as bullets' },
        },
      },
    },
    downgrades: {
      type: 'array',
      description: 'SOFT-PEDAL DOWNGRADES (✅ in the draft should be ⚠️ or removed)',
      items: {
        type: 'object', additionalProperties: false,
        required: ['draftClaim', 'why'],
        properties: {
          draftClaim: { type: 'string', description: 'draft claim being challenged' },
          why: { type: 'string', description: 'why the ✅ is unearned, citing the code' },
        },
      },
    },
    cleanPass: { type: 'string', description: 'one-sentence summary of what was independently verified, or empty if misses found' },
  },
}

const TALLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['surviving', 'downgraded', 'missed'],
  properties: {
    surviving: {
      type: 'array', description: 'Draft concerns that the panel did NOT vote to kill/downgrade.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['concern', 'location', 'proof', 'fixOptions'],
        properties: {
          concern: { type: 'string' }, location: { type: 'string' },
          proof: { type: 'string' }, fixOptions: { type: 'string' },
        },
      },
    },
    downgraded: {
      type: 'array', description: 'Draft items a majority of skeptics voted to kill or downgrade, with the consensus reason.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['draftClaim', 'votes', 'reason'],
        properties: {
          draftClaim: { type: 'string' },
          votes: { type: 'integer', description: 'how many skeptics challenged it' },
          reason: { type: 'string' },
        },
      },
    },
    missed: {
      type: 'array', description: 'New MISSES surfaced by the panel, deduped across skeptics.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['location', 'claim', 'proof', 'fixOptions', 'votes'],
        properties: {
          location: { type: 'string' }, claim: { type: 'string' },
          proof: { type: 'string' }, fixOptions: { type: 'string' },
          votes: { type: 'integer', description: 'how many skeptics independently surfaced this miss' },
        },
      },
    },
  },
}

// --- Analyze: one architectural-analysis agent per changed file -----------
// This is the Step 2 fan-out. The original spawned a single Explore agent over
// all files; we parallelize one agent per file so each reads full file + sibling
// context without a shared budget. Empty changed-file list → no analysis.
phase('Analyze')
if (CHANGED_FILES.length === 0) {
  return { ran: false, reason: 'No changed files supplied; nothing to analyze.', surviving: [], downgraded: [], missed: [] }
}

const perFile = await parallel(CHANGED_FILES.map((file) => () =>
  agent(
    `Perform a deep architectural analysis of the changes to \`${file}\` in ${REPO_ROOT}.\n\n` +
    `For this changed file:\n` +
    `1. Read the full file (not just the diff hunk) to understand intent\n` +
    `2. Read sibling files and interfaces for context\n` +
    `3. Identify: cross-cutting concerns, design pattern violations, N+1 queries, ` +
    `missing null guards, overly broad responsibilities, coupling issues\n\n` +
    `Also check: are there callers that should have been updated but weren't? ` +
    `Grep for usages of changed methods/classes.\n\n` +
    `${MANDATORY_CHECKS}\n\n${SELF_CHECKPOINT}\n\n` +
    `Return findings as architectural concerns (incl. library contracts, concurrency, wire format), ` +
    `simplification wins, and looks-good items (each naming the specific gotcha it dodges).\n\n` +
    `${PRE_REPORT_DISCIPLINE}`,
    { schema: ANALYSIS_SCHEMA, model: 'opus', agentType: 'Explore', label: `analyze:${file}`, phase: 'Analyze' }
  ).then((r) => ({ file, analysis: r || { concerns: [], simplifications: [], looksGood: [] } }))
))

const fileAnalyses = perFile.filter(Boolean)
const draftConcerns = fileAnalyses.flatMap((f) => (f.analysis.concerns || []).map((c) => ({ ...c, file: f.file })))
const draftLooksGood = fileAnalyses.flatMap((f) => (f.analysis.looksGood || []).map((g) => ({ ...g, file: f.file })))

// Assemble the draft-findings blob the adversarial panel critiques: per-file
// architectural output (Step 2) + the Step 3/4 findings the SKILL.md passed in.
const draftBlob =
  'Step 2 — per-file architectural analysis:\n' +
  JSON.stringify({ concerns: draftConcerns, looksGood: draftLooksGood }, null, 2) +
  '\n\nSteps 3 & 4 — test-quality + code-quality draft findings:\n' + DRAFT_FINDINGS

// --- Adversarial: N skeptics independently hunt misses + challenge ✅ ------
// Replaces the lone Step 4.5 agent with a panel; each skeptic varies by index.
phase('Adversarial')
const ANGLES = [
  'Prioritize the standard focus order below, but lead with library-contract and concurrency traps.',
  'Prioritize the standard focus order below, but lead with wire-format parity and runtime-guarantee test coverage.',
  'Prioritize the standard focus order below, but lead with silently-skipped APIs and unearned ✅ marks.',
  'Prioritize the standard focus order below, but lead with caller/usage gaps and cross-cutting coupling the first pass ignored.',
  'Prioritize the standard focus order below, but lead with edge cases, null guards, and error paths the first pass took for granted.',
]
const panel = await parallel(Array.from({ length: SKEPTICS }, (_unused, idx) => () =>
  agent(
    `You are an adversarial reviewer (skeptic ${idx + 1} of ${SKEPTICS}). Your sole job: read the draft findings below + the diff + ~/Dev/context/team/standards/library-gotchas.md, and find what the first pass missed.\n\n` +
    `Draft findings:\n---\n${draftBlob}\n---\n\n` +
    `Repo root: ${REPO_ROOT}\nChanged files: ${CHANGED_FILES.join(', ')}\n\n` +
    `Focus areas (in priority order):\n` +
    `1. **Every ✅ in the draft** — is it actually verified, or did the first-pass reviewer handwave? Test each claim by reading the cited code. If you can't independently confirm the gotcha was dodged, the ✅ is unearned.\n` +
    `2. **Library APIs in the diff that don't appear in the draft's analysis** — was an API skipped silently? Cross-reference library-gotchas.md.\n` +
    `3. **Concurrency patterns** (@Scheduled, queue consumers, polling loops, batch jobs, multi-pod state) — was the lock/idempotency lifetime actually traced through the call graph, or was the presence of a primitive taken as sufficient?\n` +
    `4. **Runtime-guarantee assertions** — is there a test that exercises the failure mode? A primitive being present in code is not coverage.\n` +
    `5. **Wire-format compatibility** — for any new publish/serialize path, was byte-equivalence to the legacy path actually verified?\n` +
    `6. **Anything else the first pass didn't think to check** — your charter is broader than this list. Surprise us.\n\n` +
    `${ANGLES[idx % ANGLES.length]}\n\n` +
    `Use mcp__plugin_context7_context7 if a library contract is unclear. Read the actual code; don't theorize.\n\n` +
    `Return MISSES (must add to the review), SOFT-PEDAL DOWNGRADES (✅ in the draft should be ⚠️ or removed), and a CLEAN PASS summary. ` +
    `Be specific. Cite method names and line numbers. If you can't verify something, say so — don't fabricate a clean pass.`,
    { schema: PANEL_SCHEMA, model: 'opus', agentType: 'Explore', label: `skeptic:${idx + 1}`, phase: 'Adversarial' }
  ).then((r) => ({ skeptic: idx + 1, result: r || { misses: [], downgrades: [], cleanPass: '' } }))
))

const votes = panel.filter(Boolean)
const allMisses = votes.flatMap((v) => (v.result.misses || []).map((m) => ({ ...m, skeptic: v.skeptic })))
const allDowngrades = votes.flatMap((v) => (v.result.downgrades || []).map((d) => ({ ...d, skeptic: v.skeptic })))
const cleanPasses = votes.map((v) => v.result.cleanPass).filter(Boolean)

// If no skeptic raised a miss or a downgrade, the draft survives intact.
if (allMisses.length === 0 && allDowngrades.length === 0) {
  return {
    ran: true,
    surviving: draftConcerns,
    downgraded: [],
    missed: [],
    cleanPasses,
    note: 'Adversarial panel found no misses and challenged no findings; draft survives intact.',
  }
}

// --- Tally: consensus vote over the panel's misses + downgrades -----------
// A single Haiku agent reconciles the N skeptics into one set: which draft
// items the panel voted to kill/downgrade (with vote counts), which survive,
// and the deduped MISSES (vote count = independent skeptics who surfaced it).
phase('Tally')
const tally = await agent(
  `Reconcile the votes from an ${SKEPTICS}-skeptic adversarial review panel into a single consensus set. Do not re-investigate the code; only tally and dedup what the skeptics reported.\n\n` +
  `Draft architectural concerns (Step 2):\n${JSON.stringify(draftConcerns, null, 2)}\n\n` +
  `Skeptic MISSES (each tagged with the skeptic that raised it):\n${JSON.stringify(allMisses, null, 2)}\n\n` +
  `Skeptic SOFT-PEDAL DOWNGRADES (each tagged with the skeptic that raised it):\n${JSON.stringify(allDowngrades, null, 2)}\n\n` +
  `Produce three lists:\n` +
  `1. surviving — draft concerns that NO skeptic voted to kill or downgrade. Carry them through unchanged.\n` +
  `2. downgraded — draft items challenged by one or more skeptics; set "votes" to how many skeptics challenged it and summarize the consensus reason.\n` +
  `3. missed — NEW misses surfaced by skeptics, deduped (merge misses pointing at the same location/claim); set "votes" to how many distinct skeptics independently surfaced it.\n` +
  `Match a downgrade to a surviving concern by location and claim text; if a draft concern was downgraded by a majority of skeptics, exclude it from surviving.`,
  { schema: TALLY_SCHEMA, model: 'haiku', label: 'tally:consensus', phase: 'Tally' }
)

return {
  ran: true,
  surviving: (tally && tally.surviving) || draftConcerns,
  downgraded: (tally && tally.downgraded) || [],
  missed: (tally && tally.missed) || [],
  cleanPasses,
}
