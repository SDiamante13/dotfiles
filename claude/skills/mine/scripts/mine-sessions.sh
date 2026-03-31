#!/bin/bash
set -euo pipefail

CLAUDE_ROOT="${HOME}/.claude/projects"
PROMPT=""
PROJECT=""
SINCE=""
UNTIL=""
LIMIT=20
FORMAT="table"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

find "$CLAUDE_ROOT" -name "sessions-index.json" -type f 2>/dev/null | while read -r idx; do
  jq -c '.entries[]' "$idx" 2>/dev/null
done | python3 -c "
import sys, json

prompt = '''${PROMPT}'''
project = '''${PROJECT}'''
since = '''${SINCE}'''
until_ = '''${UNTIL}'''
limit = int('''${LIMIT}''')
fmt = '''${FORMAT}'''

entries = []
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    e = json.loads(line)
    if prompt and prompt.lower() not in (e.get('firstPrompt','') + e.get('summary','')).lower():
        continue
    if project and project.lower() not in (e.get('projectPath','') + e.get('fullPath','')).lower():
        continue
    if since and e.get('created','') < since:
        continue
    if until_ and e.get('created','') > until_:
        continue
    entries.append(e)

entries.sort(key=lambda x: x.get('modified',''), reverse=True)
entries = entries[:limit]

if fmt == 'json':
    print(json.dumps(entries, indent=2))
else:
    if not entries:
        print('No sessions found.')
        sys.exit(0)
    print(f\"{'DATE':<22} {'MSGS':>5} {'PROJECT':<30} {'SUMMARY'}\")
    print('-' * 100)
    for e in entries:
        date = e.get('created','')[:19]
        msgs = e.get('messageCount', 0)
        proj = (e.get('projectPath','').split('/')[-1] or '')[:29]
        summary = (e.get('summary','') or e.get('firstPrompt',''))[:50]
        print(f'{date:<22} {msgs:>5} {proj:<30} {summary}')
"
