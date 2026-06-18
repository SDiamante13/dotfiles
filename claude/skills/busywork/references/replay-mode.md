# Replay mode (dry-run calibration)

Replay mode attempts the profile playbook against **already-merged** tickets, compares the bot's resulting diff to the merged MR's diff, and writes a scoring report. **No MRs are opened, no Jira transitions occur, no pushes are made.** Replay exists to build trust in the bot's judgment before pointing it at live backlog.

Launched via `/busywork replay [N] [board-url]` where `N` defaults to 10. The main SKILL.md reads `N` into `state.replay_remaining`, sets `state.mode_run = "replay"`, and enters the loop in `picking` mode.

## Per-tick flow

### `picking` (replay mode)

1. Run the **structural baseline** JQL — same as live mode, but targeting merged work and excluding already-replayed tickets:

   ```jql
   statusCategory = "done"
   AND resolved >= -60d
   AND (labels is EMPTY OR labels not in (busywork-replayed))
   ORDER BY resolved DESC
   ```

   Fetch via the board's Agile issue endpoint so the board filter is ANDed automatically (see `board-scoping.md`). Cap `maxResults: replay_remaining + 5` (buffer for judge drops).

   **Do not include summary-keyword matching.** The LLM judge evaluates profile fit semantically — the same judge used in live mode.

2. For each candidate in the returned list (highest-priority/most-recent first):

   a. **Skip cache check** — if present in `skipped.json` with unexpired TTL, skip.

   b. **LLM profile-fit judge** — per `llm-judge.md`, using the criteria from `profile-deprecation.md`. Cache under `judgment-cache.json`. Only `fit + confidence >= threshold` proceeds.

   c. **Structural eligibility filter** — ACs present, no open questions, multi-goal check, public-API check (see `profile-deprecation.md` §"Post-judge structural eligibility filter"). Skipped candidates do not count against `replay_remaining`.

3. For the first passing ticket: look up the merged MR (see below). If no MR can be found, skip with reason `no-merged-mr-found`.

4. Resolve sub-repo via `subrepo-resolution.md`.

5. Find the commit the MR was merged **into** (target branch HEAD at merge time), then find the commit **before** the merge. This is the replay base.

   ```bash
   # Given <iid> and <project_path>
   MERGE_COMMIT=$(glab api "projects/${encoded_project_path}/merge_requests/${iid}" | jq -r '.merge_commit_sha')
   # Replay base is the parent of the merge commit on the target-branch side.
   REPLAY_BASE=$(git -C <subrepo> rev-list --parents -n 1 "$MERGE_COMMIT" | awk '{print $2}')
   # (For a fast-forward merge, MERGE_COMMIT is the tip; REPLAY_BASE is its parent.)
   ```

6. Create a scratch worktree at `REPLAY_BASE`:

   ```bash
   git -C <subrepo> worktree add "<subrepo>-wt-replay-<TICKET>" "$REPLAY_BASE"
   ```

7. Update state: `mode=working, ticket, subrepo, worktree_path, attempt=1`. Log.

8. `ScheduleWakeup(60, ..., "replay: starting work on <KEY>")`.

### Finding the merged MR for a historical ticket

Try in order; stop on first success:

1. **MR → issue link** — `glab api "projects/${encoded_project_path}/merge_requests?state=merged&search=${TICKET}&order_by=updated_at&per_page=5"`. Pick the one whose title or description references `<TICKET>`.
2. **Branch name pattern** — many branches encode the ticket key: `glab api "...?state=merged&source_branch=*${TICKET}*"`.
3. **Commit message grep** — `git log --all --grep="${TICKET}" --format='%H %s'`; find the MR that merged the containing branch.
4. **Jira remote links** — `getJiraIssueRemoteIssueLinks` may contain a GitLab MR URL directly.

If all four fail: skip with reason `no-merged-mr-found`. Log.

### `working` (replay mode)

Follow the profile playbook exactly as in live mode, **except**:

- Do not run Jira transitions (guard in the code path: `if state.mode_run == "replay"` short-circuits the transition call).
- Do not `git push`.
- Do not invoke `/gitlab:create-mr`.
- Do not post comments.

After the playbook completes (successfully or otherwise), go straight to scoring.

### Scoring

Run `scripts/compare-diffs.mjs`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/busywork/scripts/compare-diffs.mjs" \
  --subrepo "<subrepo_base>/<subrepo>" \
  --replay-base "$REPLAY_BASE" \
  --human-merge-commit "$MERGE_COMMIT" \
  --bot-worktree "$WORKTREE_PATH" \
  --ticket "$TICKET" \
  --output "$BOARD_DIR/replay-reports/<session-timestamp>.jsonl"
```

Output lives in the per-board data dir: `$BOARD_DIR/replay-reports/<session-ts>.jsonl`.

Scoring definitions:

- **`jaccard_files`** — `|human ∩ bot| / |human ∪ bot|` over path sets
- **`loc_ratio`** — `bot_lines_changed / human_lines_changed`. Values outside [0.3, 3.0] flag as `divergent`.
- **`missed_paths`** — files the human changed that the bot did not
- **`extra_paths`** — files the bot changed that the human did not
- **`tests_passed`** — whether the bot's scratch branch passed the sub-repo's test suite at its tip
- **`summary`** — one of:
  - `within-range` — `jaccard_files >= 0.7`, `loc_ratio in [0.3, 3.0]`, `tests_passed == true`
  - `divergent` — passed tests but outside the numerical range
  - `failed` — tests failed, or the playbook bailed out before producing a diff

### Cleanup

1. Destroy the scratch worktree:

   ```bash
   git -C <subrepo> worktree remove --force "$WORKTREE_PATH"
   ```

2. Update state: `replay_remaining = replay_remaining - 1`. Reset `ticket, subrepo, worktree_path, mr, attempt, feedback_kind` to null.

3. If `replay_remaining <= 0`: print the session report summary (counts of within-range / divergent / failed) and set `mode = "stopped"`. **Do not** ScheduleWakeup — replay runs complete and exit.

4. Otherwise: `mode = "picking"`, `ScheduleWakeup(60, ..., "replay: next ticket")`.

## Fail-open semantics

Replay is calibration, not correctness. If anything goes wrong:

- Tool errors → log the error, mark the ticket `failed` in the report, release the worktree, continue.
- Playbook can't produce a diff → score `failed` with a note, continue.
- Commit/test suite hangs → give it 20 minutes, then kill and score `failed`.

**Never** let a replay error stop the overall replay run. The point is the aggregate calibration signal.

## Interpreting the report

Open `$BOARD_DIR/replay-reports/<ts>.jsonl`. Count the `summary` field:

- **≥ 70% within-range** → the profile + judge are well-calibrated; safe to run `/busywork live`.
- **40–70% within-range** → profile needs sharpening. Inspect `divergent` rows for patterns. Common culprits: judge confidence too permissive, structural filters missing a pattern, test flakiness failing the bot on mostly-correct work.
- **< 40% within-range** → don't go live yet. Iterate on `profile-deprecation.md`'s judge criteria (positive/negative examples) and re-run replay.

`missed_paths` / `extra_paths` are the most diagnostic: missed paths often reveal skip-pattern gaps; extra paths often reveal Serena's `find_referencing_symbols` catching real cases the human missed (a win) OR over-application of a pattern (a loss).

## What replay does not catch

- **Reviewer feedback quality** — replay can't simulate reviewer comments; the `addressing-feedback` path stays untested until live mode.
- **CI flakiness specific to busywork branches** — build caches, GitLab runner variations — invisible in replay.
- **Cross-team politics** — if a reviewer dislikes bot-authored MRs, replay won't tell you.

Plan the first live run against a low-stakes ticket you'd be comfortable intervening on.