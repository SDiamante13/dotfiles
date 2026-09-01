#!/usr/bin/env bash
# Runs Claude Code and restarts it when the usage window reopens.
#
#   claude-resume-loop.sh "finish milestone 1"
#   claude-resume-loop.sh --session <uuid> "continue"
#   MAX_RESUMES=10 claude-resume-loop.sh "keep building"
#
# A hook cannot do this. Hooks fire inside a live session; when the limit hits,
# the process exits and there is nothing left to fire. So this supervisor sits
# OUTSIDE claude, and claude-limit-recorder.sh (the statusLine hook) leaves it
# the exact reset epoch to wait for.
set -uo pipefail

STATE_DIR="${HOME}/.claude/limit-state"
LOG_DIR="${HOME}/.claude/limit-state/logs"
mkdir -p "$STATE_DIR" "$LOG_DIR"

MAX_RESUMES="${MAX_RESUMES:-24}"
# Small cushion past the stated reset — the window edge is not exact.
MARGIN_SECONDS="${MARGIN_SECONDS:-90}"
# Used only when we have no recorded epoch to trust.
BLIND_RETRY_SECONDS="${BLIND_RETRY_SECONDS:-900}"

SESSION_ID=''
if [ "${1:-}" = '--session' ]; then
  SESSION_ID="${2:?--session needs a uuid}"
  shift 2
fi

PROMPT="${*:?usage: claude-resume-loop.sh [--session <uuid>] <prompt>}"
PROJECT_KEY=$(pwd | sed 's#/#_#g')
RUN_LOG="${LOG_DIR}/$(pwd | sed 's#/#_#g').log"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$RUN_LOG"; }

state_file() {
  if [ -f "${STATE_DIR}/${PROJECT_KEY}.json" ]; then
    echo "${STATE_DIR}/${PROJECT_KEY}.json"
  else
    echo "${STATE_DIR}/latest.json"
  fi
}

# The soonest reset among whichever windows we actually know about. A 7-day
# limit reopening days from now is still the honest answer, so we report it
# rather than pretending a 5-hour wait will help.
next_reset_epoch() {
  local file
  file=$(state_file)
  [ -f "$file" ] || return 1
  jq -r '[.five_hour.resets_at, .seven_day.resets_at]
         | map(select(. != null and . > 0))
         | if length == 0 then empty else min end' "$file" 2>/dev/null
}

recorded_session_id() {
  local file
  file=$(state_file)
  [ -f "$file" ] || return 1
  jq -r '.session_id // empty' "$file" 2>/dev/null
}

wait_for_window() {
  local reset now sleep_for
  reset=$(next_reset_epoch || true)
  now=$(date +%s)

  if [ -z "${reset:-}" ]; then
    log "No recorded reset time. Sleeping ${BLIND_RETRY_SECONDS}s before retrying."
    sleep "$BLIND_RETRY_SECONDS"
    return
  fi

  sleep_for=$(( reset - now + MARGIN_SECONDS ))
  if [ "$sleep_for" -le 0 ]; then
    log 'Window already reopened. Resuming immediately.'
    return
  fi

  log "Window reopens $(date -r "$reset" '+%Y-%m-%d %H:%M:%S'). Sleeping $(( sleep_for / 60 ))m."
  sleep "$sleep_for"
}

attempt=0
while [ "$attempt" -le "$MAX_RESUMES" ]; do
  attempt=$(( attempt + 1 ))

  if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(recorded_session_id || true)
  fi

  if [ -n "$SESSION_ID" ] && [ "$attempt" -gt 1 ]; then
    log "Attempt ${attempt}: resuming session ${SESSION_ID}."
    claude --resume "$SESSION_ID" "$PROMPT"
  elif [ "$attempt" -gt 1 ]; then
    log "Attempt ${attempt}: no session id recorded, continuing most recent."
    claude --continue "$PROMPT"
  else
    log "Attempt ${attempt}: starting."
    claude "$PROMPT"
  fi

  exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    log 'Claude exited cleanly. Done.'
    exit 0
  fi

  log "Claude exited ${exit_code}. Treating as a limit stop."
  wait_for_window
done

log "Gave up after ${MAX_RESUMES} resumes."
exit 1
