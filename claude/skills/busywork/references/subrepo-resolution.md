# Sub-repo resolution

Every ticket must be pinned to exactly one sub-repo before busywork can create a worktree. The algorithm is trivial in single-scope and uses the LLM-as-judge pattern in multi-scope. There is no component→directory map — the filesystem enumerates the candidates and the LLM reads the ticket.

## Scope short-circuit

If `state.scope == "single"` (set by `SKILL.md` Step 1.5), resolution is immediate: the sub-repo is always `state.active_subrepo`. Skip the judge call entirely.

The algorithm below applies only when `state.scope == "multi"`.

## Algorithm (multi-scope only)

### 1. Check the cache

Key: `"<TICKET-KEY>:<updated_at>:subrepo-resolution"` in `judgment-cache.json`. On hit, return `resolved_subrepo` from the cached entry (or treat as `uncertain` if the cached verdict was `uncertain`/`unfit`).

### 2. LLM-as-judge call

Per `llm-judge.md`, using this criteria block:

```
DECISION: subrepo-resolution

Identify which of the candidate sub-repos the ticket's work should land in.

CANDIDATES: <comma-separated list of state.subrepo_candidates>

Use these signals, in order of reliability:
1. Exact file paths in the description (e.g., "src/hooks/useX.ts" — infer which sub-repo by checking which candidate owns that path pattern).
2. Package names or service names referenced in summary/description (e.g., "dr-juno", "Minerva").
3. Jira Component field values (component names often match sub-repo names directly or with minor suffix differences).
4. Linked MR URLs in description or comments — the repo in the URL is usually the answer.
5. Technology mentions that strongly point to one sub-repo (e.g., "single-spa shell" → fb-mfe-root, "MCP tool" → dr-minerva, "chat agent" → dr-juno).

If two or more candidates could plausibly own the work, verdict MUST be "uncertain" with skip_reason "multi-repo" or "ambiguous-scope".
If the ticket doesn't clearly belong to any candidate (e.g., pure documentation, platform-wide), verdict is "uncertain" with skip_reason "out-of-domain".

OUTPUT:
- verdict: fit | unfit | uncertain
- confidence: 0.0–1.0
- reasons: 1–3 bullets with the evidence you used
- skip_reason: required when verdict != "fit". One of: multi-repo, ambiguous-scope, out-of-domain.
- resolved_subrepo: required when verdict == "fit". MUST be one of the candidates (exact string match).
```

Gate: only `verdict == "fit" && confidence >= state.thresholds.subrepo_confidence` counts as resolved. Default threshold is 0.8 (stricter than profile-fit because wrong-subrepo is more expensive).

### 3. Cache and log

Write the verdict to `judgment-cache.json`. Log `{action: "subrepo-judged", ticket, verdict, confidence, resolved_subrepo?}`.

### 4. On `uncertain` or below threshold

Add the ticket to `skipped.json` with `reason: subrepo-unclear` (or `multi-repo` per the judge's skip_reason), `ttl_ends_at = now + 7 days`. The judge doesn't re-run within the TTL even if re-surfaced, because the cache still holds the stale-but-sufficient verdict until `updated_at` changes on the ticket.

## Never-do

- **Never guess a sub-repo when the verdict is `uncertain`.** A wrong sub-repo guarantees a stuck ticket later. The 7-day skip is cheaper than a bailout.
- **Never fall back to filename heuristics** if the judge returned `uncertain`. The judge already considered file paths; a second pass doesn't add signal.
- **Never re-call the judge within a tick** after a cache hit or a fresh verdict. One verdict per ticket per `updated_at`.

## Worktree creation (after resolution)

Use `state.subrepo_base` as the parent directory — this is set by Step 1.5 and is correct for both scopes:

```bash
SUBREPO="$1"  # e.g., dr-minerva (in single scope this equals state.active_subrepo)
TICKET="$2"   # e.g., DRIVE-15876
SLUG="$3"     # e.g., remove-unused-hooks (kebab-case, ≤ 40 chars, generated from summary)

cd "$SUBREPO_BASE/$SUBREPO"
git fetch origin
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|origin/||')
WORKTREE_PATH="$SUBREPO_BASE/${SUBREPO}-wt-${TICKET}"
git worktree add "$WORKTREE_PATH" -b "feat/busywork/${TICKET}-${SLUG}" "origin/${DEFAULT_BRANCH}"
```

Record `worktree_path` and `subrepo` in `state.json`.

**In single scope**, `$SUBREPO_BASE` is the parent of the user's current checkout. The worktree is a sibling of that checkout.

## Worktree deletion

On successful merge OR bailout completion:

```bash
cd "$SUBREPO_BASE/$SUBREPO"
git worktree remove --force "$WORKTREE_PATH"
git branch -D "feat/busywork/${TICKET}-${SLUG}" 2>/dev/null || true
```

Post-merge, also delete the remote branch: `git push origin --delete "feat/busywork/${TICKET}-${SLUG}"`. On bailout, leave the remote branch alone — it may be useful for a human to pick up.

## Orphan detection

At the start of every `picking` tick:

1. For each sub-repo in `state.subrepo_candidates`, run `git -C "$SUBREPO_BASE/<subrepo>" worktree list --porcelain`.
2. Any worktree whose path matches `*-wt-*` and whose branch matches `feat/busywork/*` AND whose ticket key is not `state.ticket` is an orphan.
3. Remove each orphan with `git worktree remove --force <path>`. Log `{action: "orphan-cleanup", path}`.