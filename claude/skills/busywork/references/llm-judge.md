# LLM-as-judge pattern

Busywork uses in-session LLM classification for two distinct decisions:

1. **Profile fit** — given a ticket, does it match the active profile's criteria? (called from `profile-deprecation.md`)
2. **Sub-repo resolution** — given a ticket, which sub-repo (of the filesystem-discovered candidates) does it belong to? (called from `subrepo-resolution.md`)

Both decisions share a common pattern: structured prompt, structured verdict, confidence threshold, and a per-ticket cache keyed by `{ticket_key, updated_at}`. This reference documents that pattern so the two call-sites stay consistent and future profiles don't reinvent the wheel.

## Why LLM-as-judge and not keyword JQL

Keyword JQL is cheap but noisy. `summary ~ "remove"` matches both "Remove unused hook" (a fit) and "Remove Jira job from pipeline to enable Nexus" (not a fit — CI infrastructure work, not code cleanup). The profile's real criteria are semantic: "a small, well-scoped code-removal task where the target is explicit and the call-sites are discoverable." A keyword list can't express that; a classifier can.

Cost discipline: the judge runs once per unseen `{ticket_key, updated_at}` pair. A changed ticket re-judges; an unchanged one hits the cache. In steady state the judge fires only for new tickets.

## Verdict schema

Every judge call returns exactly this shape:

```json
{
  "verdict": "fit" | "unfit" | "uncertain",
  "confidence": 0.0,
  "reasons": ["short bullet 1", "short bullet 2"],
  "skip_reason": "deprecation-not-removal | multi-goal | public-api-removal | ambiguous-scope | out-of-domain"
}
```

Fields:

- `verdict` — three-way, not boolean. `uncertain` is a valid outcome; it means "could go either way; defer until more signal." The skip taxonomy records why so humans can inspect the skip cache later.
- `confidence` — the judge's own self-rated calibration, `[0.0, 1.0]`. Downstream gate: only `verdict == "fit" && confidence >= 0.7` proceeds. Lower-confidence fits are treated as `uncertain`.
- `reasons` — short bullets; what made the judge pick this verdict. Surface in `history.jsonl` so humans can audit misses.
- `skip_reason` — only populated when `verdict != "fit"`. Must be a value from the profile's documented skip taxonomy (see `profile-deprecation.md` and `subrepo-resolution.md` for their respective taxonomies). Unknown reasons fall back to `ambiguous-scope`.

## Prompt structure (shared template)

The prompt wrapper is identical across decisions; only the criteria block differs.

```
You are a strict classifier. Output ONLY a single JSON object matching this schema:

{
  "verdict": "fit" | "unfit" | "uncertain",
  "confidence": number in [0,1],
  "reasons": ["...", "..."],
  "skip_reason": "..."  // required when verdict != "fit"
}

No prose before or after the JSON. No markdown fences.

--- CRITERIA ---
<profile-specific criteria block, with positive and negative examples>

--- TICKET ---
Key: <TICKET-KEY>
Summary: <summary>
Description:
<truncate to 4000 chars>

Labels: <labels>
Components: <component names or "(none)">
Story points: <value or "(unset)">
Linked issues (titles only): <up to 5>
Recent comments (last 5, author + first 120 chars): <...>

--- CONSTRAINTS ---
- Default toward "uncertain" when signal is thin. Being wrong here wastes less time than being wrong confidently.
- A ticket that appears to fit but whose description is prose-only under 200 characters is always "uncertain" — return skip_reason "ac-underspecified".
- A ticket whose summary joins two verbs with " and " is "unfit" with skip_reason "multi-goal".
- Output the JSON object only.
```

The constraints block is shared. Profile-specific criteria (examples, skip taxonomy) come from the profile file's "Judge criteria" section. Sub-repo resolution uses its own criteria from `subrepo-resolution.md` and a different set of shared constraints — see that file.

## Caching

File: `judgment-cache.json` under the per-board data dir (see `state-schema.md` for path). Shape:

```json
{
  "<TICKET-KEY>:<updated_at>": {
    "decision": "profile-fit | subrepo-resolution",
    "verdict": "fit",
    "confidence": 0.85,
    "reasons": ["..."],
    "skip_reason": null,
    "resolved_subrepo": "dr-juno",
    "judged_at": "2026-04-23T22:45:10Z"
  }
}
```

Key format: `"<TICKET-KEY>:<updated_at>"`. The `updated_at` component changes whenever Jira touches the ticket; the cache naturally invalidates on any ticket edit. Old keys stay in the file until the next prune (see below).

One cache file, two kinds of decision. The `decision` field disambiguates so `profile-fit` and `subrepo-resolution` can coexist for the same ticket without collision — if you need both, the key is `"<TICKET-KEY>:<updated_at>:profile-fit"` and `"<TICKET-KEY>:<updated_at>:subrepo-resolution"`.

### Cache hits

On cache hit, log `{action: "judge-cache-hit", ticket, decision}` and skip the LLM call. Do not log the full verdict on every hit — the original `judge-decided` entry in history is enough.

### Cache misses

Call the LLM. On return, write the verdict to the cache BEFORE acting on it. If the process crashes between LLM call and action, the next tick replays the action against the same verdict — no duplicate LLM spend.

### Pruning

On the first `picking` tick of a day (compare `started_at` date to `now` date), prune cache keys whose ticket key is not in the current board candidate set. This keeps `judgment-cache.json` from growing unboundedly. Conservative — errs toward keeping entries. Never prune mid-tick.

## Confidence threshold tuning

Default gate: `confidence >= 0.7` for `fit` verdicts; lower-confidence fits are treated as `uncertain` (i.e., skipped). For sub-repo resolution use `>= 0.8` because wrong-subrepo is more expensive than wrong-profile-fit (a wrong-subrepo ticket pollutes an unrelated repo's worktree).

Both thresholds live in `state` under `thresholds` so they can be tuned per board without a code change:

```json
"thresholds": {
  "profile_fit_confidence": 0.7,
  "subrepo_confidence": 0.8
}
```

First-run setup writes the defaults; operators can edit `state.json` in place if they want to tune.

## Anti-patterns

- **Never prompt the judge in natural language and parse the answer.** Always demand a single JSON object. Parse errors are a signal the prompt needs tightening, not a reason to regex-parse prose.
- **Never let the judge see the full history of prior judgments on similar tickets.** The per-ticket cache already prevents re-judging; cross-ticket priming biases the model.
- **Never merge the two decisions into one prompt.** Profile-fit and subrepo-resolution ask different questions; combining them makes verdicts entangle ("fit but unclear subrepo" ≠ "unfit").
- **Never treat `uncertain` as a soft "fit".** The whole point of the three-way verdict is to leave uncertain tickets in the backlog for humans. Treating uncertain as fit defeats the judge.
- **Never log token counts as a quality signal.** Judge calls are small and predictable; if you see unusual token spend, the cache is broken, not the prompt.

## Interaction with structural filters

The judge is **not** a replacement for the structural eligibility filter in `profile-deprecation.md` (ACs present, no unanswered questions, parent-MR gate, etc.). Those filters are cheap and catch structural problems the judge shouldn't have to reason about. Order of operations:

1. Board API returns candidates (structural JQL filter).
2. For each candidate: LLM judge → `verdict + confidence`.
3. If `fit && >= threshold`: run structural eligibility filter.
4. First passing ticket wins.

Skip reasons from step 2 and step 3 both feed `skipped.json` with 7-day TTL.