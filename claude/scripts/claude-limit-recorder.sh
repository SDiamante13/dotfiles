#!/usr/bin/env bash
# statusLine wrapper. Records the exact rate-limit reset epoch that Claude Code
# hands us, then delegates to the real status line so nothing visible changes.
#
# Why this exists: when a session dies on the usage limit, nothing inside it can
# restart it. But the status line runs after every response, so it is the last
# place we can capture WHEN the window reopens and WHICH session to resume.
# claude-resume-loop.sh reads what we write here.
set -uo pipefail

STATE_DIR="${HOME}/.claude/limit-state"
mkdir -p "$STATE_DIR"

PAYLOAD=$(cat)

# rate_limits appears only for Claude.ai subscribers, only after the first API
# response, and either window may be independently absent. // empty everywhere.
printf '%s' "$PAYLOAD" | jq -c '{
  session_id:   (.session_id // empty),
  cwd:          (.workspace.current_dir // .cwd // empty),
  recorded_at:  now | floor,
  five_hour:    (.rate_limits.five_hour  // empty),
  seven_day:    (.rate_limits.seven_day  // empty)
}' > "${STATE_DIR}/latest.json" 2>/dev/null || true

# Keep a per-project copy so a resume loop in one repo never chases another
# repo's session.
PROJECT=$(printf '%s' "$PAYLOAD" | jq -r '(.workspace.current_dir // .cwd // "") | gsub("/"; "_")' 2>/dev/null || echo '')
if [ -n "$PROJECT" ] && [ -f "${STATE_DIR}/latest.json" ]; then
  cp "${STATE_DIR}/latest.json" "${STATE_DIR}/${PROJECT}.json" 2>/dev/null || true
fi

# Delegate to the configured status line, unchanged.
printf '%s' "$PAYLOAD" | npx -y ccstatusline@latest
