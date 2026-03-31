#!/bin/bash
set -euo pipefail

CLAUDE_ROOT="${HOME}/.claude/projects"
SINCE=""
LIMIT=20
FORMAT="table"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

find "$CLAUDE_ROOT" -name "*.jsonl" -type f 2>/dev/null | while read -r f; do
  python3 -c "
import json
since = '''${SINCE}'''
with open('''$f''') as fh:
    for line in fh:
        line = line.strip()
        if not line: continue
        try:
            d = json.loads(line)
        except: continue
        if d.get('type') != 'assistant': continue
        if since and d.get('timestamp','') < since: continue
        msg = d.get('message', {})
        if not isinstance(msg, dict): continue
        for block in msg.get('content', []):
            if isinstance(block, dict) and block.get('type') == 'tool_use' and block.get('name') == 'Skill':
                inp = block.get('input', {})
                skill = inp.get('skill', '') if isinstance(inp, dict) else ''
                if skill:
                    print(skill)
" 2>/dev/null
done | sort | uniq -c | sort -rn | head -n "$LIMIT" | if [[ "$FORMAT" == "json" ]]; then
  python3 -c "
import sys, json
results = []
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    parts = line.split(None, 1)
    if len(parts) == 2:
        results.append({'skill': parts[1], 'count': int(parts[0])})
print(json.dumps(results, indent=2))
"
else
  printf "%-8s %s\n" "COUNT" "SKILL"
  printf "%s\n" "-------- ----------------------------------------"
  while read -r count skill; do
    printf "%-8s %s\n" "$count" "$skill"
  done
fi
