---
name: busywork
description: This skill should be used when the user invokes /busywork to start or resume an autonomous Jira-ticket loop, or when ScheduleWakeup fires a /busywork prompt. Picks deprecation/cleanup tickets off a user-specified Jira board, implements via BDD/TDD in an isolated worktree, opens MRs with auto-selected reviewers, addresses CI/review feedback, and auto-merges — then /clear's and picks the next. Runs in live mode against real tickets or replay mode against historical merged MRs for calibration. Triggers on "/busywork", "/busywork live [board-url]", "/busywork replay [N] [board-url]", or any continuation prompt passed in by ScheduleWakeup.
allowed-tools: Bash Read Edit Write Grep Glob Agent Skill WebFetch TaskCreate TaskUpdate ScheduleWakeup AskUserQuestion
metadata:
  argument-hint: "[live|replay [N]] [board-url]"
  author: John Wilger
  version: "0.2.0"
  tags: automation, execution, mr-feedback
---

# busywork — Autonomous Jira Loop

You are the busywork loop. Every invocation of this skill is **one tick** of a long-running, self-pacing loop. Do the minimum work for the current tick, persist state, schedule the next wake-up, and return. Never attempt to do multiple tickets in one invocation — that is what the loop is for.

## Step 0 — Parse arguments

Positional arguments, all optional:

- `live` (default when no run-mode arg is present and no state exists) → `mode_run = "live"`
- `replay [N]` → `mode_run = "replay"`, `replay_limit = N` (default 10)
- `<board-url>` → a Jira Cloud board URL (`https://<site>.atlassian.net/jira/software/c/projects/<KEY>/boards/<ID>`); required on first run, optional on continuation

If the argument list looks like a continuation sentinel (contains `busywork`, `continue`, or `<<autonomous-loop-dynamic>>`), read the existing state and continue. Never re-prompt on continuation.

Examples:

- `/busywork live https://fbinv.atlassian.net/jira/software/c/projects/DRIVE/boards/3097`
- `/busywork replay 10 https://fbinv.atlassian.net/jira/software/c/projects/DRIVE/boards/3097`
- `/busywork` (continuation — reads existing state)

## Step 1 — Resolve data dir and load state

The data dir is namespaced per board so multiple boards can coexist:

```
DATA_ROOT = ${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/busywork-fishbowl-skills}
BOARDS_DIR = $DATA_ROOT/boards
```

Actual board dir: `$BOARDS_DIR/<board-id>/`. The board ID is either from the current argument or from an existing state file selected by CWD (see below).

Load logic:

1. **If a board URL was passed as an argument**: parse it (see `references/board-scoping.md`), derive `board_id`, use `$BOARDS_DIR/<board-id>/state.json`.
2. **Otherwise, if exactly one board dir exists** under `$BOARDS_DIR` whose state.json's `subrepo_base` or `active_subrepo` matches the current CWD: use that board dir.
3. **Otherwise**: no board is known for this CWD yet — proceed to first-run setup (see `references/first-run-setup.md`): prompt once for the board URL via `AskUserQuestion`, parse it, initialize state, and continue at Step 1.5.

If the resolved `state.json` is missing, initialize via first-run setup. If it exists, read it; skip to Step 1.5.

**No `config.json`. No global config file.** All derivations come from the board URL, git, and the filesystem. Optional per-repo overrides live in `.busywork/overrides.json` inside the sub-repo itself.

Per-board files (all under `$BOARDS_DIR/<board-id>/`):

- `state.json` — single source of loop truth (see `references/state-schema.md`)
- `history.jsonl` — append-only audit log
- `skipped.json` — deferred tickets with TTL
- `reviewer-cache.json` — email → GitLab username resolutions
- `judgment-cache.json` — LLM judge verdicts keyed by `<ticket-key>:<updated_at>`
- `replay-reports/` — one JSONL file per replay session

`mkdir -p` each as needed; initialize missing files to `{}` (or empty file for JSONL).

## Step 1.5 — Detect scope (single sub-repo vs multi)

Filesystem-only detection. No config dependency:

```bash
CWD=$(pwd)
NESTED=()  # directories under CWD that contain .git
for d in "$CWD"/*/; do
  [ -d "${d}.git" ] && NESTED+=("$(basename "$d")")
done
```

- If `NESTED` is non-empty → **multi-subrepo scope**:
  - `state.scope = "multi"`
  - `state.subrepo_base = CWD`
  - `state.subrepo_candidates = NESTED` (sorted, lowercased-stable)
  - `state.active_subrepo = null`
- Else if `git rev-parse --show-toplevel` succeeds:
  - `TOP = git top-level`
  - `state.scope = "single"`
  - `state.subrepo_base = dirname(TOP)`
  - `state.active_subrepo = basename(TOP)`
  - `state.subrepo_candidates = [active_subrepo]`
- Else: error — busywork must be run inside a git repo or a directory containing sub-repos. Write `state.mode = "needs-board"` (or stay in it), do not ScheduleWakeup.

Log scope on session start (and on change) with `{action: "scope-detected", scope, active_subrepo, subrepo_base, candidates}`.

If the detected scope differs from persisted `state.scope` mid-session (user relaunched in a different directory), treat it as a new session: reset `state.ticket`, `state.mr`, `state.subrepo`, `state.worktree_path`, `state.attempt` to null; set `mode = "picking"`; log the scope change. In-flight work from the prior scope is abandoned — use `/busywork:stop` instead of moving directories mid-loop.

Scope affects:

- **Sub-repo resolution** — single-scope short-circuits to `active_subrepo` (no LLM judge call). Multi-scope uses the LLM judge against `subrepo_candidates`. See `references/subrepo-resolution.md`.
- **Worktree creation** — uses `state.subrepo_base` as the parent directory regardless of scope.

## Step 2 — Honor stop signal

If `state.mode == "stopped"`: print "busywork is stopped. Use `/busywork live` or `/busywork replay` to resume." and return. Do not schedule a wake-up.

If `state.mode == "needs-board"`: proceed to first-run setup (see `references/first-run-setup.md`). If the user cancels the prompt, stay in `needs-board` and return without scheduling.

## Step 3 — Dispatch on `state.mode`

Refer to `references/loop-state-machine.md` for the complete decision tree. In summary:

| mode | Action |
|---|---|
| `picking` | Run the active profile's board-scoped structural JQL + LLM judge + structural eligibility filter, pick one ticket, resolve sub-repo, create worktree, transition ticket → In Progress, move to `working` |
| `working` | Execute the profile's implementation playbook (research → RGR → tests/tsc/lint → commit → push → open MR) |
| `monitoring` | Poll pipeline + MR discussions; branch into `addressing-feedback` or proceed to merge |
| `addressing-feedback` | Apply fixes for CI or review threads; push; return to `monitoring` |
| `bailout` | Transient — execute cleanup sequence, then set mode to `picking` |

In replay mode (`mode_run == "replay"`), skip `monitoring`/`addressing-feedback`/merge — see `references/replay-mode.md`.

## Step 4 — Persist & schedule next wake-up

After every dispatch, regardless of outcome:

1. Write `state.json` atomically (`state.json.tmp` then `mv`).
2. Append one JSON line to `history.jsonl`: `{ts, mode, action, ticket?, mr?, note?}`.
3. Call `ScheduleWakeup` with:
   - `delaySeconds` per the table in `loop-state-machine.md`
   - `prompt = "<<autonomous-loop-dynamic>>"`
   - `reason` — short, user-facing

**Never end a tick without either scheduling a wake-up OR setting `state.mode = "stopped"` or `"needs-board"`.**

## Step 5 — Clear context at ticket boundaries

`/clear` is called from **this skill only at two points**:

1. Immediately after a successful merge (`monitoring` → `picking`).
2. Immediately after a bailout completes (`bailout` → `picking`).

Never `/clear` between wake-ups within a single ticket.

## Constraints that apply to every tick

- **Never ask the user a question during a tick.** The only exception is the first-run board URL prompt (see `first-run-setup.md`), which only fires when no state exists for the current CWD.
- **Never mutate Jira or GitLab during replay mode.** Replay is read-only on external systems.
- **Never exceed `attempt == 3` on a single ticket.** Bailout is an invariant.
- **Never pick a new ticket while `state.ticket` is set.**
- **Never leave a worktree behind.** Every `bailout` and every successful merge deletes its worktree.
- **Never commit credentials.** `.env` is sourced, never read.

## How to read the rest of this skill

| File | Read when |
|---|---|
| `board-scoping.md` | First run, and whenever candidates are fetched |
| `first-run-setup.md` | First run only |
| `llm-judge.md` | Any tick that runs the judge (picking ticks; multi-scope subrepo resolution) |
| `loop-state-machine.md` | Every tick |
| `hunt-profiles.md` | When authoring or extending a profile |
| `profile-deprecation.md` | Every `picking` and `working` tick |
| `subrepo-resolution.md` | Every `picking` tick |
| `reviewer-selection.md` | Before opening an MR |
| `replay-mode.md` | When `mode_run == "replay"` |
| `state-schema.md` | When touching any state file |
| `bailout-policy.md` | Before executing a bailout |

Scripts:

- `scripts/compare-diffs.mjs` — used by replay mode. Invoke via `node ${CLAUDE_PLUGIN_ROOT}/skills/busywork/scripts/compare-diffs.mjs <args>`.

## Skills this loop composes (do not reimplement)

- `/tdd-cycle` — RGR discipline during `working`.
- `/subtask` — reuse **only its commit + push steps**.
- `/gitlab:create-mr` — MR creation with reviewer list.
- `/gitlab:view-pipeline`, `/gitlab:monitor-pipeline` — CI status polling.

Do not invoke `/review-mr` (busywork is the *author*) or `/session-end` (busywork has its own state persistence).

## On failure

If any tool call fails in a way that breaks the current tick's flow:

- Log `{ts, mode, action: "error", error: <short msg>}` to `history.jsonl`.
- Increment `state.attempt` if working on an open ticket; never during `picking`.
- Schedule a wake-up in 60s (transient) or enter `bailout` (three attempts failed).
- Never abandon state in an inconsistent shape. If you cannot safely persist, log and exit the tick with the old state intact.