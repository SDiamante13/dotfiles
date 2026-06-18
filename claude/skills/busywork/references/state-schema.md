# State schema

All runtime data is per-board. Paths are under `${CLAUDE_PLUGIN_DATA}/boards/<board-id>/` (fallback: `~/.claude/plugins/data/busywork-fishbowl-skills/boards/<board-id>/`). Files are the single source of truth for the loop; any in-memory assumption must be re-read every tick.

## Data directory layout

```
${CLAUDE_PLUGIN_DATA}/
  boards/
    <board-id-1>/
      state.json
      history.jsonl
      skipped.json
      reviewer-cache.json
      judgment-cache.json
      replay-reports/
        <iso-timestamp>.jsonl
    <board-id-2>/
      ...
```

No top-level `config.json`. Anything a prior version stored in `${CLAUDE_PLUGIN_DATA}/config.json` is ignored by 0.2.0+; users may delete the stale file manually.

## `state.json`

Single object. Rewritten atomically every tick via `mv` from a `.tmp` sibling.

```json
{
  "mode": "picking | working | monitoring | addressing-feedback | bailout | stopped | needs-board",
  "mode_run": "live | replay",
  "profile": "deprecation-cleanup",

  "atlassian_site": "fbinv.atlassian.net",
  "cloud_id": "bccd12e8-c3d2-4faf-ab57-85e64ea4daec",
  "jira_project": "DRIVE",
  "board_id": 3097,
  "board_filter_jql": "project = DRIVE AND ... | null",

  "gitlab_host": "gitlab.com | null",
  "gitlab_group_prefix": "f3358/products/drive | null",

  "self_email": "you@example.com",
  "scope": "single | multi",
  "subrepo_base": "/abs/path",
  "subrepo_candidates": ["dr-minerva", "dr-juno", "..."],
  "active_subrepo": "dr-minerva | null",

  "transitions": {
    "to_in_progress": { "id": "11", "name": "Start Progress", "to_status_category": "indeterminate" },
    "to_done":        { "id": "31", "name": "Resolve Issue",  "to_status_category": "done" },
    "back_to_todo":   { "id": "21", "name": "Reopen",         "to_status_category": "new" }
  },

  "thresholds": {
    "profile_fit_confidence": 0.7,
    "subrepo_confidence": 0.8
  },

  "ticket": "DRIVE-15876 | null",
  "subrepo": "dr-minerva | null",
  "worktree_path": "/abs/path | null",
  "mr": {
    "iid": 12345,
    "project_path": "f3358/products/drive/dr-minerva",
    "source_branch": "feat/busywork/DRIVE-15876-remove-unused-hook",
    "web_url": "https://gitlab.com/..."
  },

  "attempt": 0,
  "feedback_kind": "ci | review | null",
  "replay_remaining": 10,

  "started_at": "2026-04-23T22:31:42Z",
  "updated_at": "2026-04-23T22:45:10Z"
}
```

### Derivation fields

`atlassian_site`, `cloud_id`, `jira_project`, `board_id`, `board_filter_jql`, `gitlab_host`, `gitlab_group_prefix`, `self_email`, `scope`, `subrepo_base`, `subrepo_candidates`, `active_subrepo`, `transitions`, `thresholds` — all derived during first-run setup (see `first-run-setup.md`). Persisted so the dispatch loop doesn't re-derive on every tick.

`self_email` is re-read on every tick from `git config user.email`; if it changes, the new value overwrites state and a `self-email-changed` row is logged. Other derivation fields change only on session boundary (scope change) or when cache-invalidation explicitly re-derives them.

### Invariants

- `mode == "picking"` ⟹ `ticket == null`, `mr == null`, `worktree_path == null`, `attempt == 0`
- `mode in ("working","monitoring","addressing-feedback","bailout")` ⟹ `ticket != null` and `subrepo != null` and `worktree_path` points to an existing directory
- `mode in ("monitoring","addressing-feedback")` ⟹ `mr != null`
- `attempt` is monotone non-decreasing within a ticket; resets to 0 on transition to `picking`
- `mode_run == "replay"` ⟹ `mr == null` (replay never opens MRs)
- `scope == "single"` ⟹ `active_subrepo != null`; any `subrepo` assigned to a ticket must equal `active_subrepo`
- `scope == "multi"` ⟹ `active_subrepo == null` and `subrepo_candidates.length >= 1`
- `mode == "needs-board"` ⟹ no other fields need to be valid; this is pre-setup state

## `history.jsonl`

Append-only JSONL. One line per state transition OR action taken. Never truncate; never rewrite in place.

```json
{"ts":"2026-04-23T22:31:42Z","mode":"picking","action":"scope-detected","scope":"multi","candidates":10}
{"ts":"2026-04-23T22:31:44Z","mode":"picking","action":"board-candidates","count":18}
{"ts":"2026-04-23T22:31:46Z","mode":"picking","action":"judge-cache-hit","ticket":"DRIVE-15876","decision":"profile-fit"}
{"ts":"2026-04-23T22:31:47Z","mode":"picking","action":"judge-decided","ticket":"DRIVE-15870","decision":"profile-fit","verdict":"fit","confidence":0.82}
{"ts":"2026-04-23T22:31:48Z","mode":"working","action":"worktree-created","ticket":"DRIVE-15876","path":"/.../dr-minerva-wt-DRIVE-15876"}
{"ts":"2026-04-23T22:33:47Z","mode":"monitoring","action":"mr-opened","mr":12345,"reviewers":["alice","bob"]}
{"ts":"2026-04-23T22:39:12Z","mode":"bailout","action":"attempt-3-reached","ticket":"DRIVE-15876","reason":"test suite failed after fix-attempt"}
```

Schema per row: `{ts, mode, action, ...payload}`. `action` is a free-form short string; consistency matters more than exhaustiveness. Use `"error"` for tool failures.

## `skipped.json`

Object keyed by Jira ticket key. Entry TTL is 7 days by default; busywork must not re-pick within the TTL window.

```json
{
  "DRIVE-15942": {
    "reason": "ac-underspecified | deprecation-not-removal | multi-goal | public-api-removal | ambiguous-scope | out-of-domain | open-question | parent-mr-open | multi-repo | subrepo-unclear | attempt-3-bailout",
    "skipped_at": "2026-04-20T14:02:11Z",
    "ttl_ends_at": "2026-04-27T14:02:11Z",
    "note": "optional short reason-specific context"
  }
}
```

Before re-picking, delete expired entries (now > ttl_ends_at). This is done in the `picking` mode, not on a schedule.

## `judgment-cache.json`

LLM-as-judge verdict cache keyed by `"<TICKET-KEY>:<updated_at>:<decision>"`. See `llm-judge.md` for schema and TTL.

```json
{
  "DRIVE-15876:2026-04-22T10:00:00Z:profile-fit": {
    "decision": "profile-fit",
    "verdict": "fit",
    "confidence": 0.85,
    "reasons": ["target symbol explicit", "single file", "call-sites discoverable"],
    "skip_reason": null,
    "judged_at": "2026-04-23T22:31:46Z"
  },
  "DRIVE-15876:2026-04-22T10:00:00Z:subrepo-resolution": {
    "decision": "subrepo-resolution",
    "verdict": "fit",
    "confidence": 0.9,
    "reasons": ["description names src/hooks/useX.ts in dr-juno"],
    "skip_reason": null,
    "resolved_subrepo": "dr-juno",
    "judged_at": "2026-04-23T22:31:47Z"
  }
}
```

## `reviewer-cache.json`

```json
{
  "someone@fbinv.com": {
    "gitlab_username": "someone",
    "resolved_at": "2026-04-22T10:14:00Z"
  }
}
```

Cached entries are good for 30 days, after which they re-resolve on use.

## `replay-reports/<ISO-timestamp>.jsonl`

One file per `replay` run (not one per ticket). JSONL, one row per replayed ticket.

```json
{"ticket":"DRIVE-15868","human_mr":12310,"scoring":{"jaccard_files":0.86,"loc_ratio":1.12,"missed_paths":[],"extra_paths":["src/foo/Bar.ts"],"tests_passed":true},"summary":"within-range","notes":"extra_paths was a correct catch — human missed a call-site","wall_time_s":312}
```

Keys:

- `jaccard_files` — 0–1, path set overlap
- `loc_ratio` — bot_lines_changed / human_lines_changed (flag if >3 or <0.3)
- `missed_paths` — files the human touched that the bot did not
- `extra_paths` — files the bot touched that the human did not
- `summary` — one of `within-range | divergent | failed`

## Per-repo overrides

Read-only input, not part of the data dir. Located at `<sub-repo>/.busywork/overrides.json` if present. See `first-run-setup.md` for the resolution rules.

```json
{
  "bot_emails": ["ci-bot@example.com"],
  "reviewer_overrides": { "email@example.com": "gitlab-username" }
}
```

Overrides are re-read every tick; never persisted into `state.json`.

## Atomic write pattern (use everywhere)

```bash
tmp="$BOARD_DIR/state.json.tmp"
# ... build JSON content
mv "$tmp" "$BOARD_DIR/state.json"
```

`mv` on the same filesystem is atomic. Never edit `state.json` in-place.