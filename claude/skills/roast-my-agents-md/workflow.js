export const meta = {
  name: 'roast-my-agents-md-ab-trial',
  description: 'The Evidence Round (Phase 2): A/B trial for N suspect AGENTS.md/CLAUDE.md rules. Runs parallel BASELINE agents (no instruction files) and parallel WITH-INSTRUCTION agents, each returning per-assertion pass/fail via schema, then JS-diffs the two runs to render a guilty / acquitted / mistrial verdict per rule. A/B agents use worktree isolation so the baseline FS-mutation does not clobber concurrent runs.',
  phases: [
    { title: 'Baseline', detail: 'parallel baseline agents — no instruction files (Sonnet, worktree-isolated)' },
    { title: 'WithInstruction', detail: 'parallel with-instruction agents — files present (Sonnet, worktree-isolated)' },
    { title: 'Verdict', detail: 'JS-diff baseline vs with-instruction → guilty / acquitted / mistrial per rule' },
  ],
}

// ---------------------------------------------------------------------------
// args: {
//   projectRoot: "<abs path>",                  // the project under test
//   suspects: [                                  // the rules on trial (Step 5)
//     { id, ruleText, control?, prompt, assertions: [{ id, text, automated }] },
//     ...
//   ]
// }
// `suspects` is produced by the SKILL.md in Phase 2 (Step 5 picks the lineup,
// Step 6 generates the eval prompt + 2-4 assertions per rule). Each suspect's
// `prompt` is a realistic task (not a test question); `assertions` are the
// grep-able / manual checks that decide pass/fail. `control: true` marks a
// positive-control rule the roaster expects to BE discriminating.
// ---------------------------------------------------------------------------
const PROJECT_ROOT = args && args.projectRoot
const SUSPECTS = (args && Array.isArray(args.suspects) ? args.suspects : []).filter(
  (s) => s && s.id && Array.isArray(s.assertions) && s.assertions.length > 0
)

if (!PROJECT_ROOT) return { error: 'missing args.projectRoot' }
if (SUSPECTS.length === 0) return { error: 'no valid suspects supplied (need id + assertions[])' }

// Per-assertion pass/fail schema. The agent runs the task, then self-reports
// whether each assertion HELD in its own output — automated assertions should
// be grep-verified, manual ones judged. `passed` is the only discriminator.
const ASSERTION_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['assertions'],
  properties: {
    assertions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'passed', 'evidence'],
        properties: {
          id: { type: 'string', description: 'the assertion id being scored' },
          passed: { type: 'boolean', description: 'did the produced work satisfy this assertion?' },
          evidence: { type: 'string', description: 'the grep hit / file:line / observation that decided it' },
        },
      },
    },
  },
}

// Render the assertion checklist for an agent prompt.
function assertionList(suspect) {
  return suspect.assertions
    .map((a) => `  - [${a.id}] (${a.automated ? 'automated/grep-able' : 'manual'}) ${a.text}`)
    .join('\n')
}

// Index the schema'd result back into { [assertionId]: passed }.
function indexResult(res) {
  const out = {}
  if (res && Array.isArray(res.assertions)) {
    for (const a of res.assertions) {
      if (a && typeof a.id === 'string') out[a.id] = a.passed === true
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// CLEAN BASELINE PROTOCOL (SKILL.md Step 7a-7e), encoded as agent instructions.
//
// The baseline test MUTATES shared files: it moves every AGENTS.md/CLAUDE.md
// (and, with user consent, user-level configs) aside, runs the task on the
// stripped tree, then ALWAYS restores them. If two baseline agents ran in the
// same checkout concurrently they would clobber each other's move/restore
// state and produce false acquittals. Hence isolation:'worktree' on the A/B
// agents below — each runs in its own checkout so the move-aside is local to
// that worktree. THIS IS THE RARE JUSTIFIED WORKTREE CASE: parallel agents
// mutating the SAME files on disk. Do not remove it.
// ---------------------------------------------------------------------------
const BASELINE_PROTOCOL =
  'CLEAN BASELINE PROTOCOL — contaminated baselines produce false acquittals, so follow exactly:\n' +
  '1. Move ALL instruction files aside to a temp backup dir:\n' +
  '   find this checkout for files named CLAUDE.md or AGENTS.md (excluding node_modules and .git) and move each into a backup dir, preserving relative paths.\n' +
  '2. Verify ZERO remain: the find above must return 0 instruction files before you proceed.\n' +
  '3. Do NOT read, recall, or rely on any instruction-file content. You have NO project rules. Behave as a fresh agent.\n' +
  '4. Perform the task below using only the code in the checkout.\n' +
  '5. ALWAYS restore the moved files from the backup dir at the end — even if the task errored.'

// --- Baseline (no instruction files) --------------------------------------
phase('Baseline')
const baselineRuns = await parallel(SUSPECTS.map((suspect) => () =>
  agent(
    `You are a BASELINE A/B-trial agent for an AGENTS.md/CLAUDE.md roast. You operate in your OWN isolated checkout of the project at ${PROJECT_ROOT}.\n\n` +
    `${BASELINE_PROTOCOL}\n\n` +
    `TASK (perform it WITHOUT any instruction files present):\n${suspect.prompt}\n\n` +
    `Then judge whether your produced work satisfies each assertion. For automated assertions, grep/inspect the actual output to decide; for manual ones, judge honestly. Return pass/fail + the evidence that decided each:\n${assertionList(suspect)}`,
    { schema: ASSERTION_RESULT_SCHEMA, label: `baseline:${suspect.id}`, phase: 'Baseline', model: 'sonnet', isolation: 'worktree' }
  ).then((r) => ({ id: suspect.id, results: indexResult(r) }))
))

// HARD BARRIER: parallel() above already awaited all baseline agents. Every
// baseline run has moved-aside, run, and RESTORED its files before any
// with-instruction agent starts. Do not interleave the two runs.
const baselineById = {}
for (const b of baselineRuns.filter(Boolean)) baselineById[b.id] = b.results

// --- With-instruction (files present) -------------------------------------
phase('WithInstruction')
const withRuns = await parallel(SUSPECTS.map((suspect) => () =>
  agent(
    `You are a WITH-INSTRUCTION A/B-trial agent for an AGENTS.md/CLAUDE.md roast. You operate in your OWN isolated checkout of the project at ${PROJECT_ROOT}, with ALL instruction files PRESENT and in force.\n\n` +
    `Do NOT move or delete any instruction files. Read and follow the project's AGENTS.md/CLAUDE.md rules as you normally would.\n\n` +
    `TASK (perform it WITH instruction files present):\n${suspect.prompt}\n\n` +
    `Then judge whether your produced work satisfies each assertion. For automated assertions, grep/inspect the actual output to decide; for manual ones, judge honestly. Return pass/fail + the evidence that decided each:\n${assertionList(suspect)}`,
    { schema: ASSERTION_RESULT_SCHEMA, label: `with:${suspect.id}`, phase: 'WithInstruction', model: 'sonnet', isolation: 'worktree' }
  ).then((r) => ({ id: suspect.id, results: indexResult(r) }))
))
const withById = {}
for (const w of withRuns.filter(Boolean)) withById[w.id] = w.results

// --- Verdict (JS-diff, no agent) ------------------------------------------
// Verdict definitions are taken VERBATIM from SKILL.md Step 8:
//   GUILTY — dead weight   : baseline already passed (rule is non-discriminating).
//   ACQUITTED — actually useful : baseline failed but with-instruction passed
//                                 (the rule changed behavior).
//   MISTRIAL — inconclusive : the two runs neither agree on pass nor show the
//                             baseline-fail → with-pass lift (ambiguous / both failed).
// We diff PER ASSERTION, then roll the assertions up to a per-rule verdict.
phase('Verdict')

function assertionVerdict(basePassed, withPassed) {
  // Only the baseline-fail → with-instruction-pass transition acquits.
  if (basePassed === true) return 'guilty'              // model already knew it
  if (basePassed === false && withPassed === true) return 'acquitted' // rule earned its keep
  return 'mistrial'                                     // both failed / inconclusive
}

// Roll per-assertion verdicts up to one per-rule verdict:
//   - any acquitted assertion → the rule is ACQUITTED (it discriminated somewhere)
//   - else any mistrial → MISTRIAL
//   - else (all guilty) → GUILTY
function ruleVerdict(perAssertion) {
  const v = perAssertion.map((a) => a.verdict)
  if (v.some((x) => x === 'acquitted')) return 'acquitted'
  if (v.some((x) => x === 'mistrial')) return 'mistrial'
  return 'guilty'
}

const verdicts = SUSPECTS.map((suspect) => {
  const base = baselineById[suspect.id] || {}
  const wth = withById[suspect.id] || {}
  const perAssertion = suspect.assertions.map((a) => {
    const basePassed = base[a.id]
    const withPassed = wth[a.id]
    return {
      id: a.id,
      text: a.text,
      automated: a.automated === true,
      baselinePassed: basePassed === true,
      withInstructionPassed: withPassed === true,
      verdict: assertionVerdict(basePassed, withPassed),
    }
  })
  return {
    id: suspect.id,
    ruleText: suspect.ruleText,
    control: suspect.control === true,
    verdict: ruleVerdict(perAssertion),
    assertions: perAssertion,
  }
})

const tally = {
  rulesTested: verdicts.length,
  guilty: verdicts.filter((v) => v.verdict === 'guilty').length,
  acquitted: verdicts.filter((v) => v.verdict === 'acquitted').length,
  mistrial: verdicts.filter((v) => v.verdict === 'mistrial').length,
}

log(`A/B trial complete: ${tally.guilty} guilty, ${tally.acquitted} acquitted, ${tally.mistrial} mistrial of ${tally.rulesTested} rules.`)

// Returned to the SKILL.md, which renders Step 8 EXHIBIT cards and the Phase 3
// FINAL VERDICT scoreboard from this structured data.
return { projectRoot: PROJECT_ROOT, tally, verdicts }