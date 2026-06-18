# Board scoping

Busywork scopes its ticket hunt to a single Jira board. A board URL is the only mandatory user input — everything else (cloudId, project key, site, workflow transitions) is derived from it. This reference covers URL parsing, cloudId discovery, the Agile API usage, and the status-naming gotcha that cost us a full replay attempt.

## URL format

Jira Cloud board URLs follow this shape:

```
https://<site>.atlassian.net/jira/software/c/projects/<PROJECT-KEY>/boards/<BOARD-ID>
```

Example:

```
https://fbinv.atlassian.net/jira/software/c/projects/DRIVE/boards/3097
```

Classic (non-next-gen) boards sometimes drop the `/c/`:

```
https://<site>.atlassian.net/jira/software/projects/<PROJECT-KEY>/boards/<BOARD-ID>
```

Parser must accept both. Trailing slashes, query strings, and fragments are discarded.

## Parsing

Pull three fields from the URL:

| Field | Source | Example |
|---|---|---|
| `atlassian_site` | hostname before `.atlassian.net` or full host | `fbinv.atlassian.net` |
| `jira_project` | path segment after `projects/` | `DRIVE` |
| `board_id` | integer after `boards/` | `3097` |

Reject with a clear error if any segment is missing. Do not silently substitute defaults — a malformed URL is a setup bug, not something to paper over.

## CloudId resolution

The Atlassian MCP tools take `cloudId`, not a hostname. Resolve once per session, cache in `state.cloud_id`.

```
getAccessibleAtlassianResources() returns:
  [{id: "<uuid>", url: "https://fbinv.atlassian.net", name: "fbinv", scopes: [...]}]
```

Match on `url` host. If zero matches: the user's Atlassian auth doesn't grant access to this site — return an error. If two matches (same site, different scope sets): prefer the one whose `scopes` contains `read:jira-work`.

## Fetching candidates from the board

Use the Agile API via the Atlassian MCP `fetch` tool. The endpoint is:

```
GET /rest/agile/1.0/board/{boardId}/issue?jql=<structural>&fields=<...>&maxResults=25
```

The board's own JQL filter is ANDed with `jql` automatically by Jira — we only supply **structural** filters here (see `profile-deprecation.md` for the structural baseline). No summary-keyword filter goes into this JQL.

The Atlassian MCP exposes direct JQL search (`searchJiraIssuesUsingJql`). To combine board filter + structural JQL through that tool path, first fetch the board's filter via `/rest/agile/1.0/board/{boardId}/configuration`, extract `filter.id`, then read the filter's JQL via `/rest/api/3/filter/{id}`, concatenate with ` AND (<structural>)`, and hand the result to `searchJiraIssuesUsingJql`. Cache the board filter JQL under `state.board_filter_jql` on first derivation; refresh at most once per session.

Prefer the direct Agile endpoint when available — it's one call. Fall back to the filter-fetch dance only when the `fetch` tool can't reach the Agile API.

## StatusCategory, not status

**Gotcha that has already bitten us.** Status names are configurable per project. The DRIVE project uses `status.name = "Complete"` for done work, not `"Done"`. A JQL of `status = Done` returns zero results against DRIVE even though 20+ recently-resolved tickets exist.

Always filter by **`statusCategory`**, which has three fixed values regardless of workflow:

| statusCategory | Meaning | Typical names |
|---|---|---|
| `new` | Not started | "To Do", "Open", "Backlog" |
| `indeterminate` | In flight | "In Progress", "In Review", "Code Review" |
| `done` | Finished | "Done", "Complete", "Closed", "Resolved" |

JQL syntax: `statusCategory in ("new", "indeterminate")`. This works across every Jira workflow. Never use `status in ("To Do", "Open")` — it's fragile and project-specific.

## Transition discovery

Workflow transition names are also project-specific. Discover them on first need via `getTransitionsForJiraIssue` on a representative ticket (the first candidate is fine). Cache in `state.transitions`:

```json
{
  "to_in_progress": { "id": "11", "name": "Start Progress", "to_status": "In Progress" },
  "to_done": { "id": "31", "name": "Resolve Issue", "to_status": "Complete" },
  "back_to_todo": { "id": "21", "name": "Reopen", "to_status": "To Do" }
}
```

Match transitions by the target status's **statusCategory**, not its name:

- `to_in_progress` → first transition whose destination has `statusCategory == "indeterminate"`
- `to_done` → first transition whose destination has `statusCategory == "done"`
- `back_to_todo` → first transition whose destination has `statusCategory == "new"` AND differs from the ticket's current status

If a needed transition can't be matched, log `{action: "transition-unavailable", want: "to_in_progress"}` and continue without the transition. Busywork should still open the MR; the ticket just stays in its current status.

## Board URL edge cases

- **Board is a scrum board with active sprints**: the Agile issue endpoint returns issues across all sprints plus backlog. That's fine — the structural JQL (assignee is EMPTY, storyPoints ≤ 3, etc.) filters unsuitable ones.
- **Board is a kanban board**: the endpoint returns all issues on the board. Same structural filter applies.
- **Board filter references a JQL function the API doesn't support in nested queries**: fall back to searching the project without the board filter, log `{action: "board-filter-unsupported"}`, and tell the user to simplify the filter. Do not guess.
- **Board is cross-project**: the board's JQL may span multiple projects. Busywork handles whichever projects the filter returns; `jira_project` (from the URL) is used only for building ticket-key-prefixed branch names.

## First-run interaction

See `first-run-setup.md` for the AskUserQuestion prompt and the derivation sequence. Board URL is prompted once; after it is stored in `state.atlassian_site + state.board_id`, subsequent ticks read from state and never re-prompt.