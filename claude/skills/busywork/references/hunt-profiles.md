# Hunt profiles

A **profile** is a named set of rules that determines:

1. **What tickets the loop will pick** (structural JQL baseline + LLM-as-judge criteria)
2. **How the loop implements them** (the working-mode playbook)
3. **What to skip** (known-bad patterns specific to this class of work)

MVP ships with a single profile: `deprecation-cleanup` (see `profile-deprecation.md`). The profile abstraction exists so adding new profiles (e.g., `scoped-typescript`, `test-assertions`) is a documentation change, not a loop rewiring.

## Profile anatomy

Each profile is a single reference file in this directory named `profile-<name>.md` with these sections:

1. **Structural JQL (candidate baseline)** — the query that surfaces candidates before judgment. Must be purely structural: status category, assignment, labels, story-point caps. **No summary-keyword matching.** Semantic matching is the judge's job.
2. **LLM-as-judge criteria** — the criteria block injected into the judge prompt (see `llm-judge.md`). Covers:
   - What "fit" looks like, with 3–5 positive example patterns
   - What "unfit" looks like, with 3–5 negative example patterns and their skip_reason values
   - What "uncertain" looks like, and the intended default-toward-caution
3. **Post-judge structural eligibility filter** — deterministic checks that run only on candidates the judge approved. Typical checks: ACs in description, no unanswered questions, not in skip cache, not tagged with blocked labels, parent-MR gate if the ticket is a follow-up.
4. **Implementation playbook** — the step-by-step work the loop does during `working` mode. Usually follows: research → acceptance test → RGR implementation → verification → commit + push → open MR.
5. **Known skip taxonomy** — every `skip_reason` value that can appear in `skipped.json` for this profile, with the trigger condition.
6. **Reference examples** — 2–3 ticket keys from the past 90 days that the profile would have handled well. Grounds the profile in real data and serves as smoke-test input for replay mode.

## How the loop uses a profile

`state.profile` names the active profile. Every `picking` tick:

1. Read `profile-<state.profile>.md`.
2. Run the structural baseline JQL via the board's Agile issue endpoint.
3. For each candidate in priority order:
   a. LLM judge (profile-fit) — cache-aware.
   b. Structural eligibility filter.
4. First candidate to pass both layers wins. Cap at 5 candidates judged per tick — yield via `ScheduleWakeup(600)` if none pass.

Every `working` tick reads the same profile file and follows its playbook. The playbook must be deterministic enough that a `/clear`-boundary-interrupted ticket can resume: the loop's `attempt` counter + the playbook's step list are sufficient state.

## Adding a new profile

1. Write `profile-<new-name>.md` following the anatomy above. The judge criteria section is usually the highest-leverage part — invest there, not in summary keywords.
2. Add the profile name to the allowed set in `state-schema.md`'s `profile` field comment.
3. Optionally expose a launch-time override (e.g., `/busywork live --profile scoped-typescript`) in SKILL.md Step 0.
4. Run replay mode against 10–20 historical merged tickets matching the profile's likely backlog to calibrate.
5. Ship. No loop changes required.

## When NOT to add a profile

- The work class is one or two tickets and won't recur.
- The work requires design judgment or stakeholder alignment in more than 10% of cases.
- The implementation playbook needs branches wider than "hit attempt 3 and bail."
- The LLM can't reliably distinguish fit from unfit even with good examples (in which case the judge criteria need more concrete structure, or the class of work isn't suitable for busywork at all).

If any of these hold, the work belongs in a human's queue, not busywork's.

## Planned future profiles (not in MVP)

- **`scoped-typescript`** — error-boundary adds, non-null-assertion replacements, narrow `any` eliminations in isolated components. Judge signal: `[M*]` tagged tickets, labels include `ci` or `testing`, summary mentions a specific component.
- **`test-assertions`** — explicit "add assertion X to test Y" tickets with a specific target. Judge signal: summary starts with `[TEST-*]` or description contains `assert` with a named target file.

These are called out so the naming is consistent when they land. Don't implement them yet — let `deprecation-cleanup` prove the loop end-to-end first.