#!/bin/zsh
# Usage: mark_seen.sh <day_dir>
# Adds the day's selected video IDs to seen.json and removes them from pending.json.
ROOT="$HOME/workspace/yt-daily-digest"
python3 - "$1" <<'PY'
import json, sys, pathlib
root = pathlib.Path.home() / 'workspace' / 'yt-daily-digest'
day = pathlib.Path(sys.argv[1])
if not day.is_absolute():
    day = root / day
ids = {x['id'] for x in json.loads((day / 'selection.json').read_text())['selected']}
seen_p = root / 'seen.json'
seen = set(json.loads(seen_p.read_text())) if seen_p.exists() else set()
seen_p.write_text(json.dumps(sorted(seen | ids), indent=0))
pend_p = root / 'pending.json'
if pend_p.exists():
    pend = [p for p in json.loads(pend_p.read_text()) if p['id'] not in ids]
    pend_p.write_text(json.dumps(pend, indent=1))
print(f"seen.json: {len(seen | ids)} ids; added {len(ids - seen)}")
PY
