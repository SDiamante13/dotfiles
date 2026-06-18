#!/usr/bin/env bash
# OPTIONAL hard gate for Slack SENDS — DORMANT by default (not registered).
#
# The skill ships with a soft (instruction-level) gate: it previews the digest
# and waits for an explicit "yes" before sending. If you want a mode-proof
# guarantee that Claude cannot post without you, register this hook by adding to
# ~/.claude/settings.json -> hooks.PreToolUse:
#   { "matcher": "^mcp__claude_ai_Slack__slack_(send|schedule)_message$",
#     "hooks": [{ "type": "command", "command":
#       "/Users/stevendiamante/.claude/skills/team-mr-digest/hooks/confirm-slack-post.sh" }] }
#
# Why "deny" and not "ask": under defaultMode=bypassPermissions a PreToolUse
# "ask" decision is silently suppressed; only "deny" is mode-proof. So this gate
# fails closed — it blocks unilateral live sends (drafts via
# slack_send_message_draft are exempt) and routes the post through a human who
# reviews and hits Send in Slack. That human action IS the confirmation, since a
# hook cannot observe a chat "yes" and therefore cannot safely allow.
cat >/dev/null  # drain the tool payload on stdin; the decision is unconditional

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Direct Slack sends are gated. Do NOT post with slack_send_message. Build the digest, show the user a preview, then stage it with slack_send_message_draft so a human reviews and sends it in Slack. (Mode-proof deny under bypassPermissions; an 'ask' would be silently skipped here.)"
  }
}
JSON
