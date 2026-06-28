export const meta = {
  name: 'review-plan',
  description: 'Multi-agent XP plan review: one parallel reviewer per lens (gaps, assumptions, critical-misses, and the five XP violations — YAGNI, simplicity, step-size, feedback-loops, tech-debt), dedup, then an adversarial-verify pass where skeptics vote to kill low-confidence findings. Returns the merged, ranked findings for the skill to present.',
  phases: [
    { title: 'Review', detail: '8 parallel independent reviewers, one per lens (Plan agents)' },
    { title: 'Verify', detail: 'adversarial skeptic vote per finding; kill the unconvincing (Haiku)' },
  ],
}

// ---------------------------------------------------------------------------
// args: { plan: "<plan text>" } OR { path: "<plan file path>" }
// The skill passes whichever it resolved in "Find the Plan". A path lets the
// reviewers read the file directly; raw text is embedded into the prompt.
// ---------------------------------------------------------------------------
const PLAN_PATH = (args && (args.path ?? args.planPath ?? args.file)) || ''
const PLAN_TEXT = (args && (args.plan ?? args.text)) || ''
const PLAN_REF = PLAN_PATH
  ? `the plan file at ${PLAN_PATH} (read it before reviewing)`
  : 'the plan below'
const PLAN_BODY = PLAN_PATH ? '' : `\n\n--- PLAN ---\n${PLAN_TEXT}\n--- END PLAN ---`

// The reviewer lenses — verbatim from the original skill's "Analyze for" block.
// Gaps / Assumptions / Critical Misses, then the five XP Violations, one agent each.
const LENSES = [
  { key: 'gaps', label: 'Gaps in Knowledge', prompt: 'Gaps in Knowledge: Missing info, undocumented dependencies, unclear external systems' },
  { key: 'assumptions', label: 'Hidden Assumptions', prompt: 'Hidden Assumptions: Implicit tech choices, assumed team capabilities, timeline assumptions' },
  { key: 'critical-misses', label: 'Critical Misses', prompt: 'Critical Misses: Plan-derailing risks, missing fallbacks, unaddressed failure modes' },
  { key: 'yagni', label: 'YAGNI', prompt: 'YAGNI: Features "just in case", premature abstractions' },
  { key: 'simplicity', label: 'Simplicity', prompt: 'Simplicity: Unjustified complexity, unnecessary ceremony' },
  { key: 'step-size', label: 'Step Size', prompt: 'Step Size: Steps >1 day, low-value steps, tight coupling' },
  { key: 'feedback-loops', label: 'Feedback Loops', prompt: 'Feedback Loops: Missing validation points, no course-correction triggers' },
  { key: 'tech-debt', label: 'Tech Debt', prompt: 'Tech Debt: Hardcoded values, missing tests, skipped docs' },
]

// XP framing — given to every reviewer verbatim (original Step 2 system line).
const PERSONA = 'You are a pragmatic XP programmer reviewing a plan.'

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['issue', 'impact', 'recommendation', 'priority'],
        properties: {
          issue: { type: 'string', description: 'the concrete problem in the plan' },
          impact: { type: 'string', description: 'why it matters / the risk if unaddressed' },
          recommendation: { type: 'string', description: 'a concrete, actionable change' },
          priority: { type: 'string', enum: ['critical', 'important', 'nice-to-have'], description: 'critical > important > nice-to-have' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['keep', 'confidence', 'justification'],
  properties: {
    keep: { type: 'boolean', description: 'false = vote to kill (this is a false positive / not grounded in the plan)' },
    confidence: { type: 'integer', minimum: 0, maximum: 100, description: 'confidence this is a real, plan-grounded issue worth surfacing' },
    justification: { type: 'string' },
  },
}

// --- Review (one independent reviewer per lens) ---------------------------
phase('Review')
const reviews = await parallel(LENSES.map((l) => () =>
  agent(
    `${PERSONA} Review ${PLAN_REF}. Work independently without seeing other reviewers' findings.\n\n` +
    `Analyze ONLY for this lens:\n\n**${l.prompt}**\n` + PLAN_BODY + '\n\n' +
    `Return a list of findings. For each give: the issue, its impact (why it matters / the risk), a concrete actionable recommendation, and a priority of critical, important, or nice-to-have. ` +
    `Be concrete and grounded in the plan's actual content — if there are genuinely no issues for your lens, return an empty list; do not invent issues.`,
    { schema: FINDINGS_SCHEMA, label: `review:${l.key}`, phase: 'Review', agentType: 'Plan' }
  ).then((r) => ({ lens: l.key, lensLabel: l.label, findings: (r && r.findings) || [] }))
))

// Flatten and tag each finding with its originating lens; drop empties.
const allFindings = reviews
  .filter(Boolean)
  .flatMap((r) => r.findings.map((f) => ({ ...f, lens: r.lens, lensLabel: r.lensLabel })))
  .filter((f) => f.issue && f.issue.trim() && f.recommendation && f.recommendation.trim())

// Dedup: two findings are the same if their issue text overlaps heavily.
// Normalize to a comparable token-set; merge lenses, keep the longest-form fields.
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3)
}
function similar(a, b) {
  const sa = new Set(normalize(a))
  const sb = new Set(normalize(b))
  if (sa.size === 0 || sb.size === 0) return false
  let shared = 0
  for (const w of sa) if (sb.has(w)) shared++
  // Jaccard >= 0.5 over the smaller set => duplicate.
  return shared / Math.min(sa.size, sb.size) >= 0.5
}
function dedup(findings) {
  const groups = []
  for (const f of findings) {
    const g = groups.find((x) => similar(x.issue, f.issue))
    if (g) {
      g.lenses.push(f.lens)
      g.lensLabels.push(f.lensLabel)
      g.priorities.push(f.priority)
      if ((f.issue || '').length > (g.issue || '').length) g.issue = f.issue
      if ((f.impact || '').length > (g.impact || '').length) g.impact = f.impact
      if ((f.recommendation || '').length > (g.recommendation || '').length) g.recommendation = f.recommendation
    } else {
      groups.push({
        issue: f.issue, impact: f.impact, recommendation: f.recommendation,
        lenses: [f.lens], lensLabels: [f.lensLabel], priorities: [f.priority],
      })
    }
  }
  // Resolve a single priority per group: highest wins (critical > important > nice-to-have).
  const rank = { critical: 3, important: 2, 'nice-to-have': 1 }
  return groups.map((g) => ({
    issue: g.issue,
    impact: g.impact,
    recommendation: g.recommendation,
    priority: g.priorities.sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0],
    lenses: [...new Set(g.lensLabels)],
  }))
}
const unique = dedup(allFindings)
if (unique.length === 0) {
  return { findings: [], note: 'No issues surfaced by any reviewer lens.' }
}

// --- Verify (adversarial skeptic vote per finding) ------------------------
phase('Verify')
const verdicts = await parallel(unique.map((f) => () =>
  agent(
    `${PERSONA} You are an ADVERSARIAL SKEPTIC. Another reviewer flagged the following issue against ${PLAN_REF}. ` +
    `Your job is to try to KILL it: assume it is a false positive until the plan's own content proves otherwise. ` +
    `Vote to keep ONLY if the issue is genuinely grounded in what the plan says (or fails to say) and is worth surfacing to the author.` +
    PLAN_BODY + '\n\n' +
    `Flagged finding: ${JSON.stringify({ lens: f.lenses, issue: f.issue, impact: f.impact, recommendation: f.recommendation, priority: f.priority })}\n\n` +
    `Return keep (boolean), a confidence 0-100 that this is a real plan-grounded issue, and a one-line justification.`,
    { schema: VERDICT_SCHEMA, model: 'haiku', label: `verify:${f.lenses.join('+')}`, phase: 'Verify' }
  ).then((v) => ({ ...f, keep: v ? v.keep : false, confidence: (v && v.confidence) || 0, justification: v && v.justification }))
))

// Kill findings the skeptic voted down or scored as low-confidence (< 50).
const kept = verdicts
  .filter(Boolean)
  .filter((f) => f.keep && f.confidence >= 50)

// Rank: priority first (critical > important > nice-to-have), then confidence.
const rank = { critical: 3, important: 2, 'nice-to-have': 1 }
kept.sort((a, b) => (rank[b.priority] || 0) - (rank[a.priority] || 0) || b.confidence - a.confidence)

if (kept.length === 0) {
  return { findings: [], note: 'All findings were killed by adversarial verification.' }
}

return { findings: kept }
