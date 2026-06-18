---
name: team-mr-digest
argument-hint: "[#channel]"
description: >-
  Build and post a digest of the team's open GitLab merge requests to a Slack
  channel. Use this whenever the user wants to share, post, summarize, round up,
  or review the team's open MRs / merge requests in Slack — phrasings like "post
  the open MRs to the channel", "MR digest", "merge request roundup", "what's
  open for the team", "standup MR list", or "send the team's open MRs to Slack".
  Queries open MRs by author username across ALL gitlab.com projects (so MRs
  outside any single group are still caught), formats a Slack mrkdwn message
  oldest-first, and ALWAYS renders a preview and waits for explicit confirmation
  before posting. Never post to Slack without the user's go-ahead.
---

# Team MR Digest

Posts a snapshot of the team's currently-open GitLab MRs to Slack. This is a
*standing digest of the open set* — deliberately different from GitLab's native
Slack app, which is event-driven (fires on MR opened/merged) and can't answer
"what's open right now."

## Why query by author, not by group

A group-scoped query (`groups/<id>/merge_requests`) silently misses any MR a
team member opens in a repo outside that group — and people open MRs in tooling,
infra, and shared repos all the time. So the digest queries **per author across
all projects** (`merge_requests?author_username=<u>&scope=all&state=opened`) and
unions the results. This is the whole reason the script exists; don't "optimize"
it back to a single group query.

## Target channel

Default to the `channel` in `scripts/config.json` (`#eng-surge`). If the user
passes a channel argument when invoking the skill (e.g. `/team-mr-digest
#manufacturing` or just `manufacturing`), post **there** instead — that argument
overrides the default for this run only. Always state the resolved target in the
preview so the user can catch a wrong channel before approving.

## Workflow

### 1. Build the message

Run the bundled script — it queries GitLab via `glab`, prints the Slack mrkdwn
message to stdout, and prints the resolved `target channel: …` to stderr:

```bash
python3 ~/.claude/skills/team-mr-digest/scripts/digest.py [--channel "#alt-channel"]
```

Pass `--channel` when the user supplied a channel argument; omit it to use the
config default. It reads `scripts/config.json` for the author list, team label,
and default channel. The script only *builds* the message — it never posts. That
separation is intentional: a human confirms before anything reaches Slack.

### 2. Render the preview

Show the user the exact message that would be posted, plus the target channel
from config. Render it as a quoted block so they can read it as it'll appear.

### 3. Get explicit confirmation — every time

This is the gate. **Do not call any Slack send tool until the user clearly
approves *this* message to *this* channel.** Approval to post once is not
standing approval for future runs — ask again next time. If the user hasn't said
yes, stop at the preview.

### 4. Post (only after an explicit yes)

- Resolve the target channel (argument if supplied, else config default) to a
  channel ID with `slack_search_channels` — strip any leading `#` for the search;
  the MCP tool needs the ID, not the name.
- Post with `slack_send_message` (channel_id + the message text).

## Configuration

`scripts/config.json`:

| field        | meaning                                                          |
|--------------|------------------------------------------------------------------|
| `team_label` | shown in the digest header (e.g. `Eng Surge`)                    |
| `channel`    | target Slack channel, human-readable (e.g. `#eng-surge`)         |
| `authors`    | gitlab.com usernames to include (display names aren't queryable) |

To change who's on the team or where it posts, edit this file — no code change.

## Scheduling a daily weekday digest

The "confirm before posting" rule still holds when automated, so a scheduled run
must **not** auto-send. The clean pattern:

- Set up a Claude Code routine with `/schedule` (weekday mornings) that runs this
  skill up to the preview, then stages a Slack **draft** in the channel via
  `slack_send_message_draft`. A draft sits in the author's composer for a human
  to glance at and send — it never posts on its own.
- Each weekday a ready-to-send draft appears; the human reviews and hits send.

Offer to set this up, but don't create the routine without the user asking.

## Safety — read this before posting

The gate here is **instruction-level only**, by the user's choice. The user runs
with `defaultMode: bypassPermissions`, under which a PreToolUse hook's `"ask"`
decision is silently suppressed — so there is no mode-proof prompt before a send.
That means the discipline in steps 2–3 is the actual safeguard: **always preview,
always wait for an explicit yes.** Treat an unconfirmed post to a team channel as
a real mistake, not a minor one.

A mode-proof hard gate is available but **dormant**: `hooks/confirm-slack-post.sh`
is a `deny`-based PreToolUse guard (deny is the only decision honored under
bypassPermissions). To enable it, register it in `~/.claude/settings.json` per the
instructions in that file's header. With it on, Claude cannot live-send at all —
it must route through the draft flow where a human hits Send in Slack.
