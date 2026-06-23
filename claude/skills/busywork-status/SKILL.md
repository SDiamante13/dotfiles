---
name: busywork-status
description: This skill should be used when the user invokes /busywork:status or asks for a summary of the busywork loop's current state, progress, or recent history. Pure read-only — displays what busywork is doing right now (mode, board, active ticket, MR, attempt counter, next scheduled wake-up reason) plus the most recent 10 history entries. Does not modify any state or external system. Triggers on "/busywork:status", "busywork status", "what is busywork doing", "where is the loop".
allowed-tools: Read Bash Glob
metadata:
  argument-hint: "(no arguments)"
  author: John Wilger
  version: "0.2.0"
  tags: automation
---

# busywork:status — Read-only summary

Display a compact snapshot of the busywork loop. This is a diagnostic tool — it never mutates state, never calls external systems, and never schedules wake-ups.

## Step 1 — Resolve the data root

```bash
DATA_ROOT="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/busywork-fishbowl-skills}"
BOARDS_DIR="$DATA_ROOT/boards"
```

If `$DATA_ROOT` or `$BOARDS_DIR` does not exist, print `busywork has never been run in this environment. Use /busywork live <board-url> or /busywork replay <board-url> to start.` and return.

## Step 2 — Select the board dir

List `$BOARDS_DIR/*/`. Three cases:

- **Exactly one board dir** → use it.
- **Multiple board dirs** → pick the one whose `state.json` has the most recent `updated_at`. Mention in the output that other boards exist (`(N other boards tracked)`).
- **Zero board dirs** → print `busywork data root exists but no board is initialized. Use /busywork live <board-url> or /busywork replay <board-url>.` and return.

Set `BOARD_DIR = $BOARDS_DIR/<selected>`.

## Step 3 — Read state

Read `$BOARD_DIR/state.json`. If missing, print `busywork state file is missing for the selected board. Likely first-run was interrupted. Re-invoke /busywork to reinitialize.` and return.

## Step 4 — Read the tail of history

Read the last 10 lines of `$BOARD_DIR/history.jsonl` if it exists. If missing or empty, show `(no history yet)`.

Use `tail -n 10 "$BOARD_DIR/history.jsonl"` via Bash — this is a small file and a short output, so Bash is fine.

## Step 5 — Print the summary

Output format (markdown, rendered in TUI):

```markdown
## busywork status

| Field | Value |
|---|---|
| Mode | {state.mode} |
| Run mode | {state.mode_run} |
| Profile | {state.profile} |
| Jira project | {state.jira_project} |
| Board ID | {state.board_id} |
| Site | {state.atlassian_site} |
| Scope | {state.scope}{' (' + state.active_subrepo + ')' if single} |
| Sub-repo base | {state.subrepo_base} |
| Candidates | {state.subrepo_candidates.length} sub-repo(s) |
| Ticket | {state.ticket or '(none)'} |
| Sub-repo | {state.subrepo or '(none)'} |
| MR | {state.mr.web_url or '(none)'} |
| Attempt | {state.attempt} / 3 |
| Started | {state.started_at} |
| Last update | {state.updated_at} |
| Replay remaining | {state.replay_remaining or 'n/a'} |

### Recent history (last 10)

- `{ts}` [{mode}] {action}: {details}
- ...
```

Format each history row compactly. `details` is a short rendering of the non-`ts`/`mode`/`action` fields (e.g., `picked=DRIVE-15876`, `reviewers=alice,bob`, `verdict=fit confidence=0.82`).

If there are other boards tracked, append one line: `(N other boards tracked — see $BOARDS_DIR)`.

## Step 6 — State-specific hints

After the table, add a one-line hint appropriate to the current mode:

- `picking` — "Looking for an eligible ticket. Next wake-up in ~30 min if none are found."
- `working` — "Implementing <ticket>. Attempt {n}/3. Next wake-up in ~1 min."
- `monitoring` — "Watching MR {iid}. Next wake-up in ~20 min if no change."
- `addressing-feedback` — "Applying {feedback_kind} fixes for MR {iid}. Attempt {n}/3."
- `bailout` — "Bailing out of {ticket}. Should complete on next tick."
- `stopped` — "Loop is stopped. /busywork live or /busywork replay to resume."
- `needs-board` — "Awaiting board URL. Re-invoke /busywork with the URL as an argument, e.g. `/busywork live https://<site>.atlassian.net/jira/software/c/projects/<KEY>/boards/<ID>`."

## Constraints

- **Never modify any file.** This skill is strictly read-only.
- **Never call external APIs** (Jira, GitLab, Slack). All information is on-disk.
- **Keep output under 35 lines.** The point is glanceable state, not a log dump.
- If `state.json` is malformed JSON: print the file path and the parse error, suggest the user inspect manually. Don't try to recover.