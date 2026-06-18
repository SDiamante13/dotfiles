---
name: busywork-stop
description: This skill should be used when the user invokes /busywork:stop or asks to halt, pause, stop, or kill the busywork loop. Writes a stop flag to busywork's per-board state file; the loop exits quietly at its next scheduled wake-up without opening new MRs or transitioning more tickets. Does not force-kill in-flight work — any ticket currently being worked will complete its current tick and stop before starting the next. Triggers on "/busywork:stop", "stop busywork", "halt busywork", "pause the loop", "kill busywork".
argument-hint: (no arguments)
allowed-tools: Read, Write, Bash, Glob
metadata:
  author: John Wilger
  version: "0.2.0"
tags:
  - automation
---

# busywork:stop — Graceful halt

Signal the busywork loop to stop on its next wake-up. This is the polite way to halt; pressing Ctrl-C on the TUI is the impolite way (both work).

## Step 1 — Resolve the data root

```bash
DATA_ROOT="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/busywork-fishbowl-skills}"
BOARDS_DIR="$DATA_ROOT/boards"
```

If `$BOARDS_DIR` doesn't exist, print `busywork is not running (no boards tracked).` and return.

## Step 2 — Select the board dir

List `$BOARDS_DIR/*/`. Three cases:

- **Exactly one board dir** → use it.
- **Multiple board dirs** → pick the one whose `state.json` has the most recent `updated_at`. Note in the output which board was stopped (`board <id>`); mention other boards are still running.
- **Zero board dirs** → print `busywork has no initialized boards.` and return.

Set `BOARD_DIR = $BOARDS_DIR/<selected>`.

## Step 3 — Read current state

Read `$BOARD_DIR/state.json`. If it's missing or the mode is already `stopped`, print `busywork is already stopped (or never started) for board <id>.` and return.

If the mode is `working`, `monitoring`, or `addressing-feedback`, warn the user:

```markdown
**Note**: busywork is currently {mode} on ticket **{ticket}** (board {board_id}). The current tick will complete, but the loop will not schedule another wake-up. Any open MR remains open — it is NOT marked Draft or closed.

If you need immediate hard-stop: Ctrl-C the busywork TUI.
```

If the mode is `picking`, just confirm the quiet stop.

## Step 4 — Write the stop flag

Update `$BOARD_DIR/state.json`:

1. Keep all existing fields.
2. Set `mode = "stopped"`.
3. Set `updated_at = <now>` (ISO 8601).

Use the atomic write pattern: write to `state.json.tmp` then `mv`.

## Step 5 — Append to history

Append one line to `$BOARD_DIR/history.jsonl`:

```json
{"ts":"<now>","mode":"stopped","action":"user-stop","previous_mode":"<prev>","ticket":"<ticket or null>"}
```

## Step 6 — Confirm

Print:

```markdown
busywork stop signal written. Loop will exit on its next wake-up.

- Board: {state.board_id} ({state.jira_project} @ {state.atlassian_site})
- Previous mode: {prev_mode}
- State file: {BOARD_DIR}/state.json

To resume: `/busywork live` or `/busywork replay` (from the same CWD).
To inspect: `/busywork:status`.
```

If multiple boards existed: append `(N other board(s) still tracked — stop them separately.)`.

## Constraints

- **Never close or mutate MRs.** If the user wanted to tear down an MR, they'd use GitLab directly.
- **Never transition Jira tickets.** Same reasoning.
- **Never delete state.** Stopping preserves everything for resume.
- **Never try to cancel a pending ScheduleWakeup directly.** The runtime will fire the wake-up; the loop will read `mode=stopped` and exit quietly. This is the designed contract.
- **Never stop all boards at once** without an explicit per-board loop — user may have only wanted one halted.