# Bailout policy

Bailout is the controlled retreat the loop takes when a ticket proves harder than its profile suggested. Bailout is not failure — it's how busywork stays within the narrow scope it was designed for, rather than sinking hours into a bad pick.

## When bailout fires

Any of:

- **`working` mode, `attempt == 3`**: the implementation playbook has failed three times (acceptance test won't go green, tests keep regressing, tsc/lint can't be satisfied, etc.).
- **`addressing-feedback` mode, `attempt == 3`**: CI failures or review comments couldn't be addressed in three pushes.
- **Orphan worktree detected with unrecoverable local state** (e.g., merge conflicts with main that arose between ticks): bail immediately.
- **Jira ticket was reassigned to a human between ticks**: the human took it over; bail respectfully.

Do NOT bail on:

- `picking` mode skips — those are not bailouts, just deferrals with TTL.
- Transient tool errors (Atlassian/GitLab 5xx) — retry these with an `attempt++` up to 3 before bailing.
- A reviewer leaving a comment that takes more than one push to address — that's normal; `addressing-feedback` is allowed up to 3 push attempts.

## Bailout sequence

Execute in order. If any step fails, log it and continue — bailout must complete even if individual steps error.

### 1. Mark MR as Draft (live mode only)

If `state.mr` is set:

```bash
glab api --method PUT "projects/${encoded_project_path}/merge_requests/${iid}" \
  -f "title=Draft: <existing title>"
```

`glab mr update --draft <iid>` also works.

Rationale: Draft preserves the work for a human to pick up, blocks further review-queue noise, and prevents accidental merge.

### 2. Post Jira comment

Use `addCommentToJiraIssue`. Keep it short and informative. Template:

```markdown
*[busywork] Handing back for human review*

Busywork attempted this ticket {attempts} times and could not complete it autonomously.

**What was attempted:**
- {short-bullet of each attempt's approach}

**Last error/blocker:**
```
{last 30 lines of the blocking failure — test output, CI log, or review comment summary}
```

**MR:** {mr_url} (marked Draft)
**Branch:** `{branch_name}` (pushed, remote branch preserved)
**Worktree:** cleaned up locally

Moving this back to To Do. If this pattern recurs, consider adding `busywork-skip` label or refining acceptance criteria.
```

Keep the comment under 2 KB. Truncate log excerpts aggressively.

### 3. Transition the Jira ticket

Move the ticket back to the workflow's "needs attention" state (typically `To Do`) using `state.transitions.back_to_todo`. Transitions are matched by **statusCategory == "new"**, not by status name — see `board-scoping.md` for the rationale ("Done" vs "Complete" naming variance). If `state.transitions.back_to_todo` is null, call `getTransitionsForJiraIssue` on the current ticket to discover and persist it before executing. After transitioning, re-fetch to verify. If the transition failed, log and continue — the comment already signals the handoff.

### 4. Add to skipped cache

```json
{
  "DRIVE-15876": {
    "reason": "attempt-3-bailout",
    "skipped_at": "<now>",
    "ttl_ends_at": "<now + 7 days>",
    "note": "bailed on attempt 3 in <mode>; last error: <short>"
  }
}
```

Write atomically to `skipped.json`. The 7-day TTL means busywork won't re-pick this ticket for a week, giving a human time to investigate.

### 5. Destroy worktree

```bash
cd "$SUBREPO_BASE/$SUBREPO"
git worktree remove --force "$WORKTREE_PATH"
# Keep the local branch — the remote branch is preserved, and a local copy helps if someone `git checkout`s to continue
```

Do NOT delete the remote branch. The draft MR still points at it; a human needs to see it.

### 6. Clear state

Update `state.json`:

```json
{
  "mode": "picking",
  "ticket": null,
  "mr": null,
  "subrepo": null,
  "worktree_path": null,
  "attempt": 0,
  "feedback_kind": null,
  "updated_at": "<now>"
}
```

Keep `mode_run`, `profile`, and `replay_remaining` (for replay mode) unchanged.

### 7. Log

Append a single comprehensive row to `history.jsonl`:

```json
{"ts":"<now>","mode":"bailout","action":"bailout-complete","ticket":"DRIVE-15876","mr":{"iid":12345,"url":"..."},"reason":"attempt-3-bailout","attempts":3,"worktree_removed":true,"comment_posted":true,"transition_verified":true}
```

### 8. `/clear`

Call `/clear` to reset context before the next ticket. Then `ScheduleWakeup(60, "<<autonomous-loop-dynamic>>", "post-bailout: picking next")`.

## What survives bailout

- The remote branch (preserved — still pushed to origin)
- The MR (preserved, marked Draft)
- Local git branch (preserved — worktree removed, branch kept)
- The Jira comment (permanent record)

## What gets cleaned up

- The local worktree directory
- The `state.ticket/mr/subrepo/worktree_path/attempt/feedback_kind` fields in `state.json`
- The in-session context (via `/clear`)

## Recovery (human intervention)

When a human picks up a bailed ticket:

- They can `git fetch` the remote branch locally.
- They can read the Jira comment to see what was tried.
- They can either fix and push (the MR is already open as Draft — they flip it to Ready) or close the MR and start fresh.

Busywork does not re-attempt bailed tickets within the 7-day TTL. After the TTL, if the ticket is still in To Do and hasn't been marked `busywork-skip`, the next `picking` tick may re-pick it — unless the human added a skip label or refined the description in a way that now fails the eligibility filter.

## Never-do in bailout

- **Never close the MR.** Closing loses history; Draft preserves it.
- **Never delete the remote branch.** The draft MR references it; losing the branch orphans the MR.
- **Never revert a commit already pushed.** Force-push-free policy applies. Bailout accepts partial work; a human decides the fate.
- **Never bail without logging.** The `history.jsonl` entry is the primary audit trail.