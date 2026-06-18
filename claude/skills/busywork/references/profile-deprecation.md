# Profile: `deprecation-cleanup`

The MVP hunt profile. Targets tickets that ask to **remove** something narrow: dead code, unused hooks, non-null assertions, deprecated API usage, stray imports. Rejects tickets that are CI/infrastructure config, multi-goal, or cross-cutting API surface work.

Profile selection uses two layers:

1. **Structural JQL** — cheap filter for unassigned, small, non-blocked tickets.
2. **LLM-as-judge** — semantic classification against the criteria prompt below. Replaces the old keyword-match JQL (`summary ~ "remove"` etc.) which produced too many false positives.

Structural **eligibility filters** (explicit ACs, no open questions, parent-MR gate, multi-repo rejection) run after the judge and are unchanged from prior versions.

## Structural JQL (candidate baseline)

Applied on top of the board's own filter. Never includes summary-keyword matching.

```jql
statusCategory in ("new", "indeterminate")
AND assignee is EMPTY
AND (labels is EMPTY OR labels not in (blocked, needs-refinement, busywork-skip, spike))
AND ("Story Points" is EMPTY OR "Story Points" <= 3)
ORDER BY priority DESC, created ASC
```

Run via the Jira Agile board issue endpoint (see `board-scoping.md`) so the board's own filter is ANDed with this baseline. Cap `maxResults: 25`. Rely on `ORDER BY` to surface priority candidates first.

Replay mode uses the same baseline except `statusCategory = "done"` and `resolved >= -60d` (see `replay-mode.md`).

Fields to request: `summary,issuetype,status,labels,components,priority,description,comment,customfield_10004,reporter,assignee,updated`. `updated` is required so the judge cache can key by `updated_at`.

## LLM-as-judge criteria

For each candidate, invoke the judge per `llm-judge.md` with the wrapper prompt and the following criteria block:

```
DECISION: profile-fit for "deprecation-cleanup"

The profile is targeting small, well-scoped removal tasks where:
- The target to remove is concrete: a named function/hook/type, a specific file, or an explicit pattern (like "non-null assertions in <component>").
- The change is local — touches one sub-repo, a bounded set of files (say <20), no cross-package coordination.
- Call-sites are discoverable from the ticket (symbol name, file path, or a precise pattern) — not a vague "clean up X" across the codebase.
- The acceptance test is writeable: a type-level assertion, a grep-based check, or a behavior test that exercises the remaining branch.

POSITIVE EXAMPLES (verdict: fit):
- "Remove unused useConversationFilterOptions hook" — names the symbol, names the file, explains why it's unused, lists files to edit. Clear removal.
- "Remove non-null assertion on sortOrder in TableHeader" — precise location, precise fix, narrow scope.
- "Remove unused assistantResponse prop from SpanTree" — exact props interface + call site to update.
- "Remove dead props from ItemLinesHeader" when the description lists the props and their (non-)uses.

NEGATIVE EXAMPLES (verdict: unfit, with skip_reason):
- "Remove Jira job in pipeline to enable Nexus" — CI/infrastructure YAML change, not code removal. skip_reason: out-of-domain.
- "Remove deprecated API — migrate callers to v2" — this is a migration, not a removal. skip_reason: deprecation-not-removal.
- "Remove exported MyUtil from package barrel" where the symbol is re-exported across sub-repos. skip_reason: public-api-removal.
- "Clean up dead code in conversations module" with no named targets and a 50-character description. skip_reason: ambiguous-scope.
- "Remove unused hooks and refactor the card component" — two verbs joined by " and ". skip_reason: multi-goal.
- "Remove company-specific validation logic" touching dr-server, dr-janus, and dr-client simultaneously. skip_reason: multi-repo.

UNCERTAIN EXAMPLES (verdict: uncertain):
- Title names a removal clearly but the description is under 200 characters of prose with no bullets or AC header.
- Title looks like a removal but the description reads like a design discussion.
- Title seems narrow but the description mentions "this also touches..." without resolution.

OUTPUT:
- verdict: one of fit | unfit | uncertain
- confidence: 0.0–1.0 self-rated
- reasons: 1–3 short bullets
- skip_reason: required when verdict != "fit". Pick from: deprecation-not-removal, multi-goal, public-api-removal, ambiguous-scope, out-of-domain, ac-underspecified.
```

Gate: only `verdict == "fit" && confidence >= state.thresholds.profile_fit_confidence` proceeds. Default threshold is 0.7.

## Post-judge structural eligibility filter

If and only if the judge returned `fit` above threshold, apply the remaining structural checks. Each check that fails writes a skip with a specific reason.

### 1. Not in skip cache

`skipped.json[KEY]` either doesn't exist or `ttl_ends_at < now`.

### 2. Explicit ACs in description

The description must contain at least one of:

- The literal string "Acceptance Criteria"
- A numbered or bulleted list with two or more items
- An explicit "Remove:" or "Delete:" header followed by one or more concrete targets (file names, symbol names, package names)

If the description is shorter than 200 characters and contains only prose, **skip with reason `ac-underspecified`**. (The judge usually catches this, but the deterministic check makes sure.)

### 3. No unanswered recent questions

Fetch the last 5 comments. For each comment body that ends with `?`: if there is no subsequent comment by the reporter, assignee, or a different commenter within 24 hours, **skip with reason `open-question`**.

### 4. Parent-MR gate for `[M*]` tagged tickets

If the summary matches `\[M\d+\]`:

- Find linked issues via `getJiraIssueRemoteIssueLinks`; check the parent MR is merged.
- If the parent MR is open, draft, or closed-but-not-merged: **skip with reason `parent-mr-open`**.
- If no parent MR is linkable and it can't be resolved from the linking comment: **skip with reason `parent-mr-unresolvable`**.

### 5. Sub-repo resolvable (multi scope only)

Use `subrepo-resolution.md`. If the judge returns `verdict == "uncertain"` or fails: **skip with reason `subrepo-unclear`**. If the description explicitly mentions files in more than one candidate sub-repo: **skip with reason `multi-repo`**.

First candidate to pass all checks is the winner. Remaining candidates this tick stay in the queue for the next `picking` tick.

## Implementation playbook (`working` mode)

### Step 1 — Research

- Fetch the ticket's full description + last 10 comments via `getJiraIssue`.
- Pull linked-issue titles via `getJiraIssueRemoteIssueLinks`.
- If the ticket mentions a specific document/decision: search Confluence via `searchConfluenceUsingCql` with `text ~ "<TICKET-KEY>"` and skim hits.
- Extract: literal symbol(s), file(s), or package(s) to remove.

Skip Slack research in MVP — add later.

### Step 2 — Locate call-sites

Use Serena's semantic tools on the worktree:

- `mcp__plugin_serena_serena__find_symbol` for named symbols → definition locations.
- `mcp__plugin_serena_serena__find_referencing_symbols` → every call-site, import, re-export.
- For non-symbol targets (literal file path, pattern like non-null assertions): `mcp__plugin_serena_serena__search_for_pattern`.

Compose a removal plan: `{files: [...], symbols_to_remove: [...], imports_to_clean: [...]}`. Working memory only — do not write to state.

### Step 3 — Acceptance test

Write or extend a test that fails **only while the target is still referenced**. Options:

- **TypeScript type test**: `never`-type assertion that fails to compile while the symbol exists in a module's export surface.
- **Runtime assertion**: test that greps the built bundle or source for the symbol and fails if found.
- **Coverage-based**: if removing a dead branch, add a test that exercises the remaining branch and asserts the dead branch's side effects never occur.

If no straightforward acceptance test is writeable, use the **type checker as the acceptance test**: `tsc --noEmit` must pass, and the sub-repo's strict rules (no-unused-vars, no-dead-code) flag or accept the change. Document this choice in the MR body.

### Step 4 — RGR implementation

Use `/tdd-cycle` via the Skill tool. Outside-in: run the acceptance test (red), apply the smallest removal that could make it green, run the test (green), refactor. Triangulate across call-sites: remove them one at a time if the symbol is referenced in more than 3 places, running tests between.

Follow the sub-repo's CLAUDE.md — every sub-repo has its own testing guide. Respect it.

### Step 5 — Verify

- Sub-repo's full test suite (`npm run test` or `yarn test` per the sub-repo's package manager).
- `tsc --noEmit` in each TS sub-repo. Zero errors.
- Lint (`npm run lint` if available). Zero errors.
- Git status must be clean of untracked files that should have been added.

Any failure with `attempt < 3` → log + `attempt++` + `ScheduleWakeup(60)`.
Any failure at `attempt == 3` → `bailout-policy.md`.

### Step 6 — Commit + push

Use the commit message convention the sub-repo already uses (inspect `git log` for the last 5 commits' style). Busywork-authored commits prepend `[busywork] ` to the subject line. Sign commits if the sub-repo requires it.

Push to origin on `feat/busywork/<KEY>-<slug>`.

### Step 7 — Open MR

Build the reviewer set (see `reviewer-selection.md`), then invoke `/gitlab:create-mr`:

- **Title**: `[busywork] <TICKET-KEY>: <short summary>`
- **Not draft** (per approved plan)
- **Source branch**: `feat/busywork/<KEY>-<slug>`
- **Target branch**: `main` (or sub-repo's default — check `git symbolic-ref refs/remotes/origin/HEAD`)
- **Reviewers**: computed set
- **Body**:

  ```markdown
  Closes <TICKET-KEY>.

  ## What changed

  <one-paragraph summary of what was removed>

  Call-sites touched: <N>
  Files touched: <M>

  ## Why this is autonomous-safe

  - Acceptance test: <describe>
  - Full test suite passed locally
  - `tsc --noEmit` clean
  - Lint clean

  ---

  _This MR was opened autonomously by busywork. Reviewers were selected from CODEOWNERS, recent git history, and the ticket's Jira metadata._
  ```

### Step 8 — Transition ticket

If the project's workflow has an `In Review` state (statusCategory = `indeterminate` but differs from `In Progress`), transition to it. Otherwise leave at `In Progress`. Match transitions by statusCategory (see `board-scoping.md`).

Verify by re-fetching.

## Known skip taxonomy

Every skip writes to `skipped.json` with 7-day TTL and logs to `history.jsonl`. Reason values:

| Reason | Trigger |
|---|---|
| `deprecation-not-removal` | Ticket asks to add `@deprecated` tag rather than remove |
| `multi-goal` | Summary joins two verbs with " and " |
| `public-api-removal` | Removal would cross package barrels / shared index.ts |
| `ambiguous-scope` | Judge: no concrete target, no named files/symbols |
| `out-of-domain` | Judge: not code cleanup (CI, config, docs, etc.) |
| `ac-underspecified` | Description < 200 chars of prose, no AC structure |
| `open-question` | Last 5 comments include an unanswered question ≥ 24h |
| `parent-mr-open` | `[M*]` tag whose parent MR is not yet merged |
| `parent-mr-unresolvable` | `[M*]` tag whose parent MR can't be located |
| `multi-repo` | Description references files in multiple sub-repos |
| `subrepo-unclear` | Sub-repo LLM judge returned `uncertain` |
| `attempt-3-bailout` | Work failed three times |

## Reference examples

Ticket keys that showed up in the DRIVE backlog and would have been good fits for MVP. Useful smoke-test candidates for replay mode:

- **DRIVE-15876** — "Remove unused useConversationFilterOptions hook" — single file, explicit unused reason, short description with bullet list.
- **DRIVE-15870** — "[M6] Remove non-null assertion on sortOrder in TableHeader" — precise location, precise fix.
- **DRIVE-15868** — "[M4] Remove unused assistantResponse prop from SpanTree" — prop-level scope, explicit edit list.

All three had status `Open` (statusCategory = `new`) at the time of design. Replay needs `statusCategory = "done"` tickets; the first replay run against DRIVE with this profile will depend on what the judge accepts from the recent backlog.