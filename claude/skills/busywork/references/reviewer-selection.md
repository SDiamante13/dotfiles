# Reviewer selection

Busywork opens MRs with a reviewer list computed from three signals: **CODEOWNERS** matches for touched files, **recent git authors** of those files, and **Jira ticket metadata** (reporter, assignee, watchers). Union, dedupe, filter, cap at 4.

The goal is to route the MR to people who are already context-rich about the code being touched — not to spray it across a team.

## Settings (read from state and optional overrides)

| Setting | Source | Default |
|---|---|---|
| `self_email` | `state.self_email` (derived from `git config user.email`) | required, set in first-run setup |
| `bot_emails` | `<active-sub-repo>/.busywork/overrides.json#bot_emails` | `[]` if file absent |
| `reviewer_overrides` | `<active-sub-repo>/.busywork/overrides.json#reviewer_overrides` | `{}` if file absent |

Overrides are re-read every tick from the filesystem; they are intentionally version-controlled in the sub-repo so teammates share them.

## Inputs

- MR's changed-file list. Get it before opening the MR:

  ```bash
  cd <worktree>
  git diff --name-only origin/main...HEAD
  ```

- Sub-repo's CODEOWNERS file at any of: `CODEOWNERS`, `.gitlab/CODEOWNERS`, `.github/CODEOWNERS`, `docs/CODEOWNERS`. Graceful fallback if absent.

- Jira ticket's `reporter`, `assignee` (if non-empty before busywork claimed it — check `history.jsonl` for the pre-pick snapshot), and `watches`. Fetch via `getJiraIssue` with `fields: [reporter, assignee, watches]`.

## Algorithm

### Step 1 — CODEOWNERS signal

Parse CODEOWNERS (`#` comments, blank lines, `pattern @user1 @user2 @group`):

- For each changed file, find every pattern that matches (standard CODEOWNERS glob semantics).
- Later patterns override earlier ones per GitLab's resolution rules — take the last match.
- Expand groups (`@f3358/products/drive-owners`) into member users via `glab api groups/<group-path>/members` (cache under `reviewer-cache.json` with 30-day TTL keyed by group path).
- Produce a set of GitLab usernames for CODEOWNERS.

If no CODEOWNERS file is present: this signal is empty. Continue.

### Step 2 — Recent authors signal

For each changed file, find the last 5 distinct author emails:

```bash
git log --follow --format='%ae' -n 20 -- <file> | awk '!seen[$0]++' | head -5
```

Union across all changed files. Call this `authors_by_email`.

### Step 3 — Jira metadata signal

From the ticket fetch:

- `reporter.emailAddress`
- `assignee.emailAddress` if it was non-empty prior to the pick
- Each entry in `watches.watchers[].emailAddress` (may require `getJiraIssue` with a `watches` expand)

Call this `jira_emails`.

### Step 4 — Email → GitLab username

Combine `authors_by_email` ∪ `jira_emails`. For each email not already in `reviewer-cache.json`:

```bash
glab api "users?search=<email>&per_page=1"
```

- Exact email match → use that user's `username`.
- No match → check `reviewer_overrides[email]` (from `.busywork/overrides.json`). If set, use it. Otherwise, drop the email from the set and log `{action: "reviewer-unresolved", email}` so the user can add an override later.

Cache resolutions in `reviewer-cache.json` with `resolved_at`. Re-resolve after 30 days.

### Step 5 — Union, filter, cap

1. Union CODEOWNERS usernames (Step 1) with resolved usernames (Step 4).
2. Remove:
   - `self_email`'s resolved username
   - Any entry in `bot_emails`'s resolved usernames
   - The user identified in the ticket's Jira reporter if it is self
3. Dedupe.
4. Cap at 4 reviewers. If >4, prefer in order: CODEOWNERS matches first, then most-recent authors, then Jira reporter, then watchers.

### Step 6 — Attach

Pass the final list to `/gitlab:create-mr` as the reviewer argument.

If the final list is empty: open the MR with no reviewers, post a Jira comment `"[busywork] MR <url> opened without reviewers — automatic selection produced none. Please assign as appropriate."`, and continue. Do not bail.

## Special cases

### Dot-file-only changes

If the only changed files are config/dotfiles (e.g., `.eslintrc.json`, `package.json` scripts), CODEOWNERS may over-match. Prefer recent authors of *those specific files* over a broad CODEOWNERS group.

### Generated / vendored files

Files under `generated/`, `vendor/`, `dist/`, `node_modules/` should not drive author selection. Exclude from the git log query.

### Squash-history sub-repos

`git log --follow` may produce fewer distinct authors in squash-merge repos. Still take the last 5 distinct; if only one emerges, that's fine.

## Example

MR touching 3 files in `dr-minerva`:

- `src/tools/inventory.ts` — CODEOWNERS: `@alice @bob`; recent authors: `alice@, carol@, bob@`
- `src/tools/manufacturing.ts` — CODEOWNERS: `@alice @bob`; recent authors: `alice@, dan@`
- `tests/integration/inventory.spec.ts` — no CODEOWNERS match; recent authors: `carol@, dan@, alice@`

Ticket reporter: `eve@`. Watchers: (none).

- CODEOWNERS union: `alice, bob`
- Authors (emails): `alice@, carol@, bob@, dan@`
- Jira emails: `eve@`
- After email → username resolution (all succeed): `alice, carol, bob, dan, eve`
- CODEOWNERS ∪ authors ∪ jira = `{alice, bob, carol, dan, eve}` — 5 total, cap at 4
- Priority: CODEOWNERS first (`alice, bob`), then most-recent authors excluding already included (`carol, dan`), then Jira reporter (`eve` — dropped due to cap)
- Final: `alice, bob, carol, dan`

If `eve@` resolved but is also `state.self_email`, it would have been dropped in Step 5.

## Never-do

- **Never pick the operator themselves** (self_email gate). Routes MRs back to a noisy review queue.
- **Never include a bot account** (bot_emails gate). Bots don't click approve.
- **Never attach more than 4 reviewers.** Diffusion of responsibility dominates past that point.