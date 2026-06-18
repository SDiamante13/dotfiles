# First-run setup

The first time busywork runs for a given CWD (no matching per-board state exists), it derives its entire operating context from three inputs: a Jira board URL, the user's git config, and the filesystem. No global config file is involved. This reference documents that derivation and the single interactive prompt used when the board URL isn't provided as an argument.

## Inputs to derive

| Field | Source | Required |
|---|---|---|
| `atlassian_site`, `jira_project`, `board_id` | Parsed from board URL | yes |
| `cloud_id` | `getAccessibleAtlassianResources` matched against `atlassian_site` | yes |
| `self_email` | `git config user.email` (per-repo), falls back to `git config --global user.email` | yes |
| `gitlab_host`, `gitlab_group_prefix` | Parsed from `git remote get-url origin` of the first candidate sub-repo | live-mode only |
| `subrepo_candidates` | Filesystem scan of CWD for subdirs containing `.git/` | yes |
| `scope`, `active_subrepo`, `subrepo_base` | CWD + candidates (see `SKILL.md` Step 1.5) | yes |
| `transitions` | `getTransitionsForJiraIssue` on first candidate ticket (deferred until needed) | live-mode only |
| `bot_emails`, `reviewer_overrides` | Optional `.busywork/overrides.json` in active sub-repo | no |

Anything not derivable blocks the loop and is reported clearly; busywork never silently substitutes defaults for missing derivations.

## Sequence

1. **Argument parse** — if the invocation included a board URL, use it. Otherwise:
2. **Board prompt** — exactly one `AskUserQuestion` call, with a single open-text question: `"Paste the Jira board URL (e.g., https://<site>.atlassian.net/jira/software/c/projects/<KEY>/boards/<ID>)"`. This is the only user-facing prompt first-run setup makes.
   - If the user declines/cancels: write `state.mode = "needs-board"`, log, return without ScheduleWakeup. Re-invocation will re-prompt.
3. **URL parse** — parse per `board-scoping.md`. On failure: error message, `state.mode = "needs-board"`, return.
4. **CloudId resolution** — call `getAccessibleAtlassianResources`, match by site host. On zero or ambiguous results: error, return.
5. **Git email** — read `git config user.email` (repo-local first, then global). On empty: error with "Run `git config --global user.email <you>@<domain>` and re-invoke busywork." Return without ScheduleWakeup.
6. **Scope detection** — per `SKILL.md` Step 1.5. Populate `subrepo_candidates`, `subrepo_base`, `scope`, `active_subrepo`.
7. **GitLab remote parse (live mode only)** — `git -C <first-candidate-sub-repo> remote get-url origin`. Parse the URL:
   - `git@gitlab.com:group/subgroup/repo.git` → host `gitlab.com`, group_prefix `group/subgroup`
   - `https://gitlab.com/group/subgroup/repo.git` → same
   - If parse fails: log `{action: "remote-unparseable"}`, leave `gitlab_host`/`gitlab_group_prefix` null, continue. MR creation will fail later with a more targeted error.
8. **Overrides** — if `.busywork/overrides.json` exists in the active sub-repo (single scope) or in the first candidate sub-repo (multi scope, best-effort), read it. Merge into runtime settings; do not persist into `state.json` — overrides are re-read every tick from the filesystem so teams can version-control changes.
9. **Transitions** — deferred. Leave `state.transitions = null` until the first `picking` tick successfully chooses a candidate, then call `getTransitionsForJiraIssue` and populate. Replay mode never transitions, so `state.transitions` stays null in replay.
10. **Persist** — atomically write `state.json` with `mode = "picking"`, `started_at` and `updated_at` set, all derived fields populated.
11. **Schedule** — `ScheduleWakeup(60, "<<autonomous-loop-dynamic>>", "first tick after setup")`.

## The board prompt

Use `AskUserQuestion` for this one interaction only. Prompt text:

> **Busywork needs a Jira board URL to know which tickets to hunt.**
>
> Paste the URL of the board you want busywork to work off. Example:
> `https://fbinv.atlassian.net/jira/software/c/projects/DRIVE/boards/3097`

Accept any response as text; do not provide multiple-choice options. On cancellation, enter `needs-board` mode and exit without scheduling.

This prompt is the **only** user-facing question in the entire loop. Every other decision flows through cached state or per-ticket LLM judgment. The "Never ask the user a question during a tick" rule in `SKILL.md` has one exception and this is it.

## `.busywork/overrides.json`

Optional per-repo file. Meant to be committed so teammates share the same bot filter and email-mapping conventions. All fields optional:

```json
{
  "bot_emails": ["ci-bot@fbinv.com", "renovate-bot@example.com"],
  "reviewer_overrides": {
    "alice.smith@fbinv.com": "alicesmith-gl",
    "bob.jones@fbinv.com": "bob-j"
  }
}
```

Resolution order at read time:

- **Single scope**: `<subrepo_base>/<active_subrepo>/.busywork/overrides.json`
- **Multi scope**: each candidate sub-repo's `.busywork/overrides.json` is read; entries merge by key with later candidates winning on conflict (first-wins would be more conservative — choose per your team's convention and document the choice). For MVP we use **last-wins, candidates sorted alphabetically** so behavior is deterministic.

Missing file = empty overrides. Corrupt JSON = error with file path, skip overrides (don't abort the loop).

## Interaction with existing state

If the current CWD already has a state file (per-board path resolves to an existing `state.json`), skip this entire setup. The existing state holds all derivations; the only check on every tick is scope re-detection (Step 1.5) for Ctrl-C/relaunch-in-a-different-dir cases.

If the CWD matches a state file but git config has changed (e.g., user changed their email), `self_email` is re-read on every tick. Don't fail on mismatch between `state.self_email` and current `git config user.email` — update state and move on, logging `{action: "self-email-changed", from, to}`.

## What first-run does NOT do

- Create the worktree (that's `picking`).
- Query any Jira tickets (deferred to `picking`).
- Call GitLab (deferred to MR creation).
- Write any config file other than `state.json`.
- Ask more than one question.

Keep first-run cheap. The goal is to get from "user typed /busywork live <url>" to "state.json exists, mode=picking, first ScheduleWakeup queued" in under 10 seconds, with one interactive round-trip at most.