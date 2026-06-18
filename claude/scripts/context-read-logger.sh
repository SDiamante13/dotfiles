#!/bin/bash
# PostToolUse hook: logs Read calls to the ai-context repo
set -euo pipefail

CONTEXT_DIR="$HOME/Dev/context/team"
LOG_FILE="$CONTEXT_DIR/logs/reads-$(hostname -s).jsonl"

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")

[ "$TOOL" = "Read" ] || exit 0

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

# Expand ~ if present
FILE_PATH="${FILE_PATH/#\~/$HOME}"

# Only log reads inside the context repo
[[ "$FILE_PATH" == "$CONTEXT_DIR/"* ]] || exit 0

# Relative path from repo root
REL_PATH="${FILE_PATH#$CONTEXT_DIR/}"

mkdir -p "$CONTEXT_DIR/logs"

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")
SESSION_ID="${SESSION_ID:-${CLAUDE_SESSION_UUID:-unknown}}"
HOST=$(hostname -s)

jq -cn \
  --arg ts "$TS" \
  --arg session "$SESSION_ID" \
  --arg host "$HOST" \
  --arg file "$REL_PATH" \
  '{ts: $ts, session: $session, host: $host, file: $file}' >> "$LOG_FILE"
