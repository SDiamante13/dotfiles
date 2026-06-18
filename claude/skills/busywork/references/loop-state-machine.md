# Loop state machine

The busywork loop is a state machine driven by `state.mode`. Every tick reads state, dispatches by mode, updates state, schedules a wake-up, returns. Nothing else.

See `state-schema.md` for exact field shapes and `board-scoping.md` for how candidates are fetched.

## Transitions

```
                 ┌──────────────────────────────┐
                 │                              │
                 ▼                              │
            ┌─────────┐                         │
  start ─▶  │ picking │ ◀──── (merge OR bailout completes) ───┐
            └─────┬───┘                                       │
                  │ eligible ticket found                     │
                  ▼                                           │
            ┌─────────┐     fail attempt 3     ┌──────────┐   │
            │ working │ ─────────────────────▶ │ bailout  │   │
            └─────┬───┘                        └─────┬────┘   │
                  │ MR opened                        └────────┘
                  ▼
            ┌────────────┐
            │ monitoring │ ◀─┐
            └─────┬──────┘   │
                  │           │
        ┌─────────┴─────────┐ │
        │                   │ │
        ▼                   ▼ │
  merge conditions    feedback (CI or review)
        │                   │
        ▼                   ▼
    picking          ┌───────────────────┐
                     │ addressing-       │
                     │ feedback          │
                     └─────┬─────────────┘
                           │ push success
                           └──▶ monitoring
                           │ fail attempt 3
                           └──▶ bailout
```

## Dispatch table

### `picking`

1. Expire `skipped.json` entries where `ttl_ends_at < now`.
2. Fetch candidates via the board-scoped endpoint (see `board-scoping.md`) + structural baseline JQL (see `profile-deprecation.md`).
3. For each candidate in returned order, run the LLM profile-fit judge (`llm-judge.md` + criteria from the profile file), cache-aware.
4. For each `fit` candidate above threshold, run the structural eligibility filter (ACs, open-question, parent-MR gate, multi-repo check).
5. On the first candidate that passes both layers: resolve sub-repo (see `subrepo-resolution.md`). In single scope this is a short-circuit to `state.active_subrepo`; in multi scope the LLM judge runs. If the judge returns `uncertain`: add to `skipped.json` with `reason: subrepo-unclear`, log, move to the next candidate.
6. Zero eligible tickets (either zero candidates or every candidate skipped):
   - Log `{action: "no-eligible", scope, judged, skipped}`.
   - `ScheduleWakeup(1800, "<<autonomous-loop-dynamic>>", "waiting for eligible tickets")`.
   - Return.
7. In **live** mode: transition the Jira ticket to In Progress using `state.transitions.to_in_progress` (discover on first use — see `board-scoping.md`). Re-fetch and verify; if the transition didn't apply, log and continue (not a bailout condition).
8. Create the git worktree (see `subrepo-resolution.md`).
9. Update state: `mode=working, ticket=<KEY>, subrepo, worktree_path, attempt=1`. Log.
10. `ScheduleWakeup(60, "<<autonomous-loop-dynamic>>", "starting work on <KEY>")`.

Bounded inner loop: at most 5 candidates judged+filtered per tick before yielding with `ScheduleWakeup(600)`. This caps the judge cost per tick.

### `working`

Execute the active profile's implementation playbook — for `deprecation-cleanup` see `profile-deprecation.md`. The playbook is the substantive work of the tick.

On success (acceptance test passes + full test suite + tsc + lint + committed + pushed):

1. Build the reviewer set — see `reviewer-selection.md`.
2. In **live** mode: invoke `/gitlab:create-mr` with `[busywork] <TICKET>: <summary>`, not-draft, reviewers attached, body explaining the autonomous origin.
3. In **replay** mode: hand off to `replay-mode.md`. Do not open an MR.
4. Update state: `mode=monitoring, mr={...}`. Log.
5. `ScheduleWakeup(300, "<<autonomous-loop-dynamic>>", "waiting on first CI run")`.

On failure:

- `attempt < 3`: increment, log the failure shape, `ScheduleWakeup(60, ..., "retrying work")`.
- `attempt == 3`: transition to `bailout` — see `bailout-policy.md`.

### `monitoring`

1. Fetch pipeline status via `glab api projects/<id>/merge_requests/<iid>/pipelines` (or `/gitlab:view-pipeline`).
2. Fetch discussions via `glab api projects/<id>/merge_requests/<iid>/discussions`.
3. Classify:
   - **Mergeable**: CI succeeded, required approvals present, no open/unresolved discussions → merge with `glab mr merge <iid> --when-pipeline-succeeds --remove-source-branch --squash`. On merge success: transition Jira ticket using `state.transitions.to_done` (match by `statusCategory == "done"`), delete worktree, `/clear`, set `mode=picking`, reset `ticket/mr/subrepo/worktree_path/attempt`, log, `ScheduleWakeup(60, ..., "picking next")`.
   - **CI failing**: `mode=addressing-feedback, feedback_kind=ci`. `ScheduleWakeup(60)`.
   - **Actionable review**: discussion containing a `?`, explicit change request, or `Changes requested` state → `mode=addressing-feedback, feedback_kind=review`. `ScheduleWakeup(60)`.
   - **Waiting**: still running CI OR waiting on approvals OR waiting on reviewer response → `ScheduleWakeup(1200, ..., "waiting on reviewers/CI")`.

### `addressing-feedback`

1. Collect the failing surface: failing CI job logs OR specific discussion threads.
2. Attempt fixes in the worktree. Re-run local tests + tsc + lint before pushing.
3. Commit + push.
4. For review threads asking a question: post a short reply once the fix lands, referencing the commit. For threads demanding a specific change: do not mark resolved — let the reviewer resolve it.
5. Update state: `mode=monitoring`. Log. `ScheduleWakeup(300, ..., "pushed feedback fix")`.

Failure handling matches `working`: `attempt++` up to 3, then `bailout`.

### `bailout`

See `bailout-policy.md`. Destructive-by-design transient state; on completion sets `mode=picking` and calls `/clear`.

### `stopped`

Quiet no-op. Do not schedule a wake-up. The only way out is a new user-invoked `/busywork live` or `/busywork replay`.

### `needs-board`

Print the first-run board prompt (see `first-run-setup.md`). If the user provides a URL, derive settings and transition to `picking`. If the user cancels, stay in `needs-board` and exit without scheduling.

## Delay table (typical)

| Context | `delaySeconds` | Reason shown in telemetry |
|---|---:|---|
| Queued pick, no blocker | 60 | "starting work on <KEY>" |
| Between work attempts | 60 | "retrying work" |
| After opening MR | 300 | "waiting on first CI run" |
| After pushing feedback fix | 300 | "pushed feedback fix" |
| Waiting on reviewers/CI mid-run | 1200 | "waiting on reviewers/CI" |
| No eligible tickets | 1800 | "waiting for eligible tickets" |

Rationale: the Anthropic prompt cache has a 5-minute TTL. Values under 300s keep the cache warm; 1200s+ amortizes a cache miss over a genuinely idle wait. Avoid 300s as a pure wait (worst of both worlds).

## Orphan cleanup

At the start of every `picking` tick, look for worktrees matching `<subrepo>-wt-*` where the ticket key is not `state.ticket`. Delete them. Log one line per deletion. This catches cases where the previous tick died before cleanup.

## Never-do list

- Never transition `picking` → `picking` without yielding via `ScheduleWakeup` — infinite-loop protection.
- Never mutate external systems (Jira, GitLab) during replay mode.
- Never call `/clear` except at the two defined points in SKILL.md Step 5.
- Never assume a field in `state.json` exists without guarding for `null`.