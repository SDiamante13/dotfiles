export const meta = {
  name: 'tidy',
  description: 'Sequential green-gate refactoring loop: for each human-approved refactor, an agent applies ONLY that one refactor (never touching test code), a gate agent runs the test suite, and the loop commits with the "- r <refactor>" format only when the gate reports passed===true; otherwise it reverts and retries up to a 3-strike cap, then halts. Returns per-refactor outcomes.',
  phases: [
    { title: 'Tidy', detail: 'per approved refactor: apply -> green gate -> commit or revert/retry (cap 3)' },
  ],
}

// ---------------------------------------------------------------------------
// args: {
//   refactors: ["<refactor description>", ...],   // the human-APPROVED list (order = priority)
//   testCommand: "<how to run the suite>",         // optional; agent infers if omitted
//   productionFile?: "<path>",                     // optional; the file being tidied
//   testFile?: "<path>"                            // optional; tests must NEVER be modified
// }
// The approval (scan -> present numbered list -> ask which to proceed with -> wait for
// confirmation) happens interactively in the SKILL.md. This workflow runs only the loop.
// ---------------------------------------------------------------------------
const REFACTORS = (args && args.refactors) || []
const TEST_COMMAND = (args && args.testCommand) || ''
const PRODUCTION_FILE = (args && args.productionFile) || ''
const TEST_FILE = (args && args.testFile) || ''

// Strike cap — verbatim from the original skill ("If a refactor fails three times").
const STRIKE_CAP = 3

// Hard invariant — verbatim from the original skill (top of file + Refactoring Loop).
const NEVER_TOUCH_TESTS =
  'NEVER make changes to Test code in this process. You may ONLY modify production code. ' +
  (TEST_FILE ? `The test file ${TEST_FILE} is off-limits — do not edit it under any circumstance.` : '')

// Commit message format — verbatim from the original skill (Refactoring Loop step 3):
// commit with message format `"- r <refactoring>"` (quotes must include the - r).
function commitMessage(refactor) {
  return `- r ${refactor}`
}

const FILE_HINT = PRODUCTION_FILE ? ` in ${PRODUCTION_FILE}` : ''
const TEST_HINT = TEST_COMMAND ? ` Run the suite with: ${TEST_COMMAND}.` : ' Run the project test suite.'

const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['passed', 'output'],
  properties: {
    passed: { type: 'boolean', description: 'true ONLY if the entire test suite passed' },
    output: { type: 'string', description: 'concise test runner output / failure summary' },
  },
}
const APPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['applied', 'diff'],
  properties: {
    applied: { type: 'boolean', description: 'true if the refactor was applied to production code' },
    diff: { type: 'string', description: 'the unified diff of the change (production code only)' },
  },
}

// --- Tidy loop ------------------------------------------------------------
// Deterministic sequential gate loop. For each approved refactor we apply it,
// run a green gate, and commit ONLY when the gate's schema reports passed===true.
// On a red gate we revert and retry, up to STRIKE_CAP attempts; after the cap we halt.
phase('Tidy')
const outcomes = []

for (let r = 0; r < REFACTORS.length; r++) {
  const refactor = REFACTORS[r]
  log(`Refactor ${r + 1}/${REFACTORS.length}: ${refactor}`)

  const attempts = []
  let committed = false

  for (let attempt = 1; attempt <= STRIKE_CAP; attempt++) {
    // 1) Apply ONLY this one refactor to production code. Never touch tests.
    const applied = await agent(
      `Apply ONLY this single refactoring${FILE_HINT}, one refactor at a time, in priority order: "${refactor}". ` +
      `Do not bundle in any other change. ${NEVER_TOUCH_TESTS} ` +
      `Make the change to the production code, then return whether you applied it and the unified diff (production code only).`,
      { schema: APPLY_SCHEMA, label: `apply:${r + 1}:attempt-${attempt}`, phase: 'Tidy' }
    )

    // 2) Green gate — run the test suite. Deterministic: we commit only on passed===true.
    const gate = await agent(
      `Run the test suite to verify the production-code refactoring did not break behavior.${TEST_HINT} ` +
      `Do NOT modify any code (production or test) — only run the suite and report. ` +
      `Return passed=true ONLY if the entire suite passes, otherwise passed=false with the failure output.`,
      { schema: GATE_SCHEMA, model: 'haiku', label: `gate:${r + 1}:attempt-${attempt}`, phase: 'Tidy' }
    )

    if (gate && gate.passed === true) {
      // 3) Tests pass -> commit with the EXACT commit-message format.
      await agent(
        `The refactoring "${refactor}" passed the test suite. Stage the production-code change and commit it with ` +
        `this EXACT commit message (the quotes are not part of the message; the leading "- r " IS): "${commitMessage(refactor)}". ` +
        `Do not stage or commit any test-file changes. Report the resulting commit sha.`,
        { label: `commit:${r + 1}`, phase: 'Tidy' }
      )
      attempts.push({ attempt, passed: true, output: gate.output })
      committed = true
      log(`  committed: "${commitMessage(refactor)}"`)
      break
    }

    // 4) Tests fail -> revert this attempt's changes and retry a different approach.
    await agent(
      `The refactoring "${refactor}" failed the test suite (attempt ${attempt}/${STRIKE_CAP}). ` +
      `Revert the uncommitted production-code changes from this attempt (eg. git checkout/restore the modified production files) ` +
      `so the working tree returns to the last committed state. ${NEVER_TOUCH_TESTS} Do not commit anything.`,
      { label: `revert:${r + 1}:attempt-${attempt}`, phase: 'Tidy' }
    )
    attempts.push({ attempt, passed: false, output: gate && gate.output })
    log(`  attempt ${attempt} failed; reverted`)
  }

  outcomes.push({
    index: r + 1,
    refactor,
    committed,
    commitMessage: committed ? commitMessage(refactor) : null,
    attempts,
    halted: !committed, // hit the strike cap without a green gate
  })

  // Stop condition (verbatim): "If a refactor fails three times" -> halt the loop and
  // let the SKILL.md pause and check with the user. Do not silently skip ahead.
  if (!committed) {
    log(`Halting: "${refactor}" failed ${STRIKE_CAP} times.`)
    break
  }
}

return {
  total: REFACTORS.length,
  attempted: outcomes.length,
  committed: outcomes.filter((o) => o.committed).length,
  halted: outcomes.some((o) => o.halted),
  outcomes,
}
