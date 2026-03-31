#!/bin/bash
set -euo pipefail

CLAUDE_ROOT="${HOME}/.claude/projects"
PROJECT=""
BY="session"
SINCE=""
LIMIT=20
FORMAT="table"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --by) BY="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

find "$CLAUDE_ROOT" -name "*.jsonl" -type f 2>/dev/null | while read -r f; do
  if [[ -n "$PROJECT" ]] && ! echo "$f" | grep -qi "$PROJECT"; then
    continue
  fi
  echo "$f"
done | python3 -c "
import sys, json, os
from collections import defaultdict

by = '''${BY}'''
since = '''${SINCE}'''
limit = int('''${LIMIT}''')
fmt = '''${FORMAT}'''

buckets = defaultdict(lambda: {'input': 0, 'output': 0, 'cache_create': 0, 'cache_read': 0})

for filepath in sys.stdin:
    filepath = filepath.strip()
    if not filepath: continue
    project = filepath.split('/')[-2] if '/' in filepath else 'unknown'
    try:
        with open(filepath) as fh:
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
                usage = msg.get('usage', {})
                if not usage: continue

                if by == 'session':
                    key = os.path.basename(filepath).replace('.jsonl','')[:36]
                elif by == 'day':
                    ts = d.get('timestamp','')[:10]
                    key = ts if ts else 'unknown'
                elif by == 'project':
                    key = project
                else:
                    key = 'all'

                buckets[key]['input'] += usage.get('input_tokens', 0)
                buckets[key]['output'] += usage.get('output_tokens', 0)
                buckets[key]['cache_create'] += usage.get('cache_creation_input_tokens', 0)
                buckets[key]['cache_read'] += usage.get('cache_read_input_tokens', 0)
    except Exception:
        continue

items = sorted(buckets.items(), key=lambda x: x[1]['input'] + x[1]['output'], reverse=True)[:limit]

if fmt == 'json':
    print(json.dumps([{'key': k, **v} for k, v in items], indent=2))
else:
    if not items:
        print('No token data found.')
        sys.exit(0)
    print(f\"{'KEY':<38} {'INPUT':>10} {'OUTPUT':>10} {'CACHE_CR':>10} {'CACHE_RD':>10}\")
    print('-' * 82)
    for key, v in items:
        print(f\"{key:<38} {v['input']:>10,} {v['output']:>10,} {v['cache_create']:>10,} {v['cache_read']:>10,}\")
    totals = {k: sum(v[k] for _, v in items) for k in ('input','output','cache_create','cache_read')}
    print('-' * 82)
    print(f\"{'TOTAL':<38} {totals['input']:>10,} {totals['output']:>10,} {totals['cache_create']:>10,} {totals['cache_read']:>10,}\")
"
