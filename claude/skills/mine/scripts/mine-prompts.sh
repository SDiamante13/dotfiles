#!/bin/bash
set -euo pipefail

SESSION=""
ROLES="user,assistant"
LIMIT=50
FORMAT="table"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --roles) ROLES="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SESSION" ]]; then
  echo "Usage: mine-prompts.sh --session <path-to-jsonl>" >&2
  exit 1
fi

if [[ ! -f "$SESSION" ]]; then
  echo "Session file not found: $SESSION" >&2
  exit 1
fi

python3 -c "
import sys, json

session_path = '''${SESSION}'''
roles = set('''${ROLES}'''.split(','))
limit = int('''${LIMIT}''')
fmt = '''${FORMAT}'''

messages = []
with open(session_path) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        d = json.loads(line)
        if d.get('type') not in roles:
            continue
        msg = d.get('message', {})
        if not isinstance(msg, dict):
            continue
        role = msg.get('role', d.get('type',''))
        content = msg.get('content', '')
        ts = d.get('timestamp', '')
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get('type') == 'text':
                        parts.append(block.get('text',''))
                    elif block.get('type') == 'tool_use':
                        parts.append(f\"[tool_use: {block.get('name','')}]\")
                    elif block.get('type') == 'tool_result':
                        parts.append('[tool_result]')
            text = ' '.join(parts)
        else:
            continue
        if not text.strip():
            continue
        messages.append({'role': role, 'timestamp': ts, 'text': text})

messages = messages[:limit]

if fmt == 'jsonl':
    for m in messages:
        print(json.dumps(m))
else:
    for m in messages:
        ts = m['timestamp'][:19] if m['timestamp'] else ''
        role = m['role'].upper()[:5]
        text = m['text'][:120].replace('\n', ' ')
        print(f'{ts}  {role:<5}  {text}')
"
