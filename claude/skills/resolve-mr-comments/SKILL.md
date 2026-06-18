---
name: resolve-mr-comments
description: Autonomously resolve unresolved review comments on a GitLab merge request — fetch the threads (human reviewers AND the CodeRabbit bot), judge each comment for validity instead of blindly applying it, fix the valid ones test-first, commit/push, then reply on each thread with rationale and resolve the ones that were fixed. Use this whenever the user wants to address, action, work through, or "knock out" merge-request / MR / review feedback, points at an MR number or URL, or says things like "look at the comments on MR-1234 and fix what's valid", "address the review feedback", "resolve the coderabbit comments", or invokes /resolve-mr-comments. Triggers even when the user only gives an MR number with no other context.
argument-hint: [MR-number | MR-URL]
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Agent, Skill, AskUserQuestion
metadata:
  author: Steven Diamante
  version: "1.0.0"
---

# Resolve MR Comments

Work through the unresolved review comments on a GitLab merge request the way a careful engineer
does: read each one, decide whether it's actually right, fix the valid ones properly (test-first),
and close the loop on the MR by replying with what changed and resolving the threads you addressed.

The core idea that makes this skill worth having: **a review comment is a hypothesis, not an order.**
Reviewers (especially bots) are often right, sometimes wrong, and occasionally raising something real
but out of scope. Blindly applying every suggestion produces churn and can introduce bugs. The value
here is judgment — separating "valid, fix it" from "valid observation, defer" from "not actually a
problem" — and then being transparent about that judgment on the thread.

## Inputs

The MR is identified by the argument: a bare number (`4721`), `MR-4721`, `!4721`, or a full GitLab
URL. If none is given, infer it from the current branch (the push output and `glab mr list
--source-branch $(git branch --show-current)` both surface it) and confirm before proceeding.

## Workflow

### 1. Locate the MR and verify the branch

- `glab auth status` — confirm authenticated; if not, tell the user to run `glab auth login`.
- Derive the URL-encoded project path from `git remote get-url origin` (everything after the host,
  `/` → `%2F`). This keeps the skill repo-agnostic — it works in any `dr-*` repo, not just the one it
  was written in.
- Fetch MR metadata: `glab api "projects/{proj}/merge_requests/{iid}"` → read `source_branch`,
  `state`, `web_url`.
- Compare `source_branch` to `git branch --show-current`. If they differ, stop and ask before
  checking out — you must be on the MR's branch to fix and push. Never fix against the wrong branch.

### 2. Fetch and triage the threads

```bash
glab api "projects/{proj}/merge_requests/{iid}/discussions" --paginate > /tmp/mr_discussions.json
```

Keep only threads that are **non-system** (`notes[0].system == false`) and **unresolved**
(`any(.notes[]; .resolvable == true and .resolved == false)`). Pull out, per thread: the
`discussion_id` (`.id`), author username, `position.new_path:new_line`, and the comment body.

Both human reviewers and the **CodeRabbit bot** count. This repo's CodeRabbit bot username is
`Deployment-User1` (noted in dr-server CLAUDE.md; not "Dev-Ops9" as some tooling assumes) — but don't
filter by author to decide validity. A bot comment can be right and a human comment can be wrong;
judge the substance.

### 3. Judge each comment for validity

For every thread, read the code it points at (use Serena's semantic tools for typed code per the
user's global guidance) and the surrounding context — including any project `CLAUDE.md`, which often
documents the *intended* behavior a comment may be contradicting (or confirming). Classify into one
of three buckets:

- **Valid — fix it.** A real bug, correctness gap, inconsistency with documented intent, or a cheap
  improvement clearly worth making. Anything labeled a defect, NPE, data-loss, silent-drop, or
  parity-break almost always lands here.
- **Valid observation — defer.** A legitimate point that's out of scope, risky to fold into this MR,
  or a larger refactor better done separately (e.g. "parallelize these calls", "unify these two
  paths"). Real, but not now.
- **Not valid.** Based on a misreading, already handled elsewhere, or contradicted by the design
  documented in `CLAUDE.md`. Be honest when this is the case — don't fix something that isn't broken
  to appease a comment.

You own this call. Run autonomously: assess, then act, and only stop to ask the user on a genuine
judgment call (e.g. a "valid observation — defer" where it's unclear whether they'd want it in scope).
Lean on `AskUserQuestion` for those, not for routine fixes.

### 4. Fix the valid ones — test-first

This codebase enforces a TDD gate (a hook blocks production edits until `/core:tdd-cycle` is invoked).
Honor it for real — it's not ceremony, it's how changes here stay safe:

1. Invoke the `core:tdd-cycle` skill once at the start of the fixing phase.
2. For each fix: write ONE failing test that pins the corrected behavior → run it, see it RED for the
   intended reason → write the minimum code to pass → run, see GREEN. Refactor only with tests green.
3. One behavior per cycle. Don't batch several fixes behind one test.
4. When a fix changes a documented invariant, update the relevant `CLAUDE.md` in the same change —
   this repo's convention is that design rationale lives in `CLAUDE.md`, not inline comments.

Run the affected test classes (and a slightly wider package sweep) at the end to confirm nothing
regressed. Trust `BUILD SUCCESS` + the total test count over surefire's per-class counts when using a
comma-separated `-Dtest=` (the counts interleave across forks — see dr-server CLAUDE.md).

### 5. Commit and push

Commit the fixes with a descriptive message that summarizes what was addressed and references the MR,
ending with the co-author trailer:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

Then push. Do this **before** replying on the MR so the replies can cite the commit SHA — a reviewer
seeing "fixed in `<sha>`" can jump straight to the change. If the branch is somehow `main`, stop and
ask; never push fixes to the default branch.

### 6. Reply on every thread, then resolve selectively

Reply to all threads — including the ones you didn't fix. Silence reads as "ignored."

- **Fixed:** confirm the comment was valid, say what changed and why, cite the SHA, and name the
  test(s) that now guard it. Concrete and short.
- **Deferred / not valid:** explain the reasoning plainly. For "not valid", point at the code or the
  `CLAUDE.md` line that already handles it. Stay collegial — you're disagreeing with a comment, not a
  person.

Post a reply:
```bash
glab api -X POST "projects/{proj}/merge_requests/{iid}/discussions/{discussion_id}/notes" \
  --raw-field 'body=...'
```
> Use `--raw-field` (not `-f body=@file`) — `glab` does not expand `@file` the way curl does.

Resolve a thread:
```bash
glab api -X PUT "projects/{proj}/merge_requests/{iid}/discussions/{discussion_id}" -F resolved=true
```

Resolution policy:
- **Fixed threads → resolve them.**
- **Deferred / not-valid threads → reply, leave open, and ask the user** whether to resolve, file a
  follow-up, or leave for the reviewer. Don't unilaterally resolve a thread you pushed back on — the
  reviewer should get the chance to respond.

### 7. Report

Summarize crisply: what was fixed (with SHA + test names), what was deferred and why, what was judged
not valid, the final test result, and the resolution state of each thread. Flag anything still needing
the user's decision.

## Verify before asserting

Before telling the user a thread is resolved or a fix is in, re-fetch the discussions and confirm the
`resolved` flags and your replies actually landed. Report the real state, including any thread left
open on purpose.

## Notes

- Independent API calls (multiple replies, multiple resolves) can be batched in one shell invocation —
  they don't depend on each other.
- If `glab` isn't authenticated or the project path can't be derived from the remote, stop and surface
  that rather than guessing.
- This skill mutates a live MR (pushes commits, posts public comments, resolves threads). Those are
  outward-facing actions — the autonomy here is scoped to *this* MR because the user invoked the skill
  on it. Don't widen scope to other MRs or branches without being asked.
