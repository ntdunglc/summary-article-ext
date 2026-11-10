#!/bin/zsh
# Usage: scrape_feed.sh <out.json>
# Scrapes https://www.youtube.com/feed/subscriptions (signed-in Default Chrome profile)
# and writes a JSON array of {id, url, title, channel, views, age, duration, durationSec}.
set -e
source "${0:A:h}/common.sh"
OUT=$1
open_url "https://www.youtube.com/feed/subscriptions"
$=AB wait --fn "document.querySelectorAll('ytd-rich-item-renderer a[href*=\"/watch\"]').length > 5" >/dev/null 2>&1 || true
# Scroll to lazy-load ~2 days of uploads
for i in 1 2 3 4 5; do
  $=AB eval "window.scrollBy(0, 4000)" >/dev/null; sleep 1.5
done
ensure_yt_tab
cat <<'EOF' | $=AB eval --stdin | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()))' > "$OUT"
(() => {
  const toSec = s => (s || '').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
  const seen = new Set();
  const items = [];
  for (const it of document.querySelectorAll('ytd-rich-item-renderer')) {
    const a = it.querySelector('a[href*="/watch"]');
    if (!a) continue;                       // Shorts / posts
    const id = new URL(a.href).searchParams.get('v');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const parts = (it.querySelector('yt-lockup-metadata-view-model, #details, #meta')?.innerText || '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    const isLive = /^LIVE$/i.test(parts[0] || '');
    if (isLive) parts.shift();
    const badge = (it.querySelector('badge-shape, ytd-thumbnail-overlay-time-status-renderer')?.textContent || '').trim();
    const duration = /^\d+(:\d+)+$/.test(badge) ? badge : '';
    items.push({
      id, url: `https://www.youtube.com/watch?v=${id}`,
      title: parts[0] || '', channel: parts[1] || '',
      views: parts.length > 3 ? parts[parts.length - 2] : '',
      age: parts[parts.length - 1] || '',
      duration, durationSec: toSec(duration), badge: duration ? '' : badge, isLive
    });
  }
  return JSON.stringify({ signedIn: !!document.querySelector('#avatar-btn'), count: items.length, items }, null, 1);
})()
EOF
python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(f"signedIn={d['signedIn']} items={d['count']}")
for it in d['items']:
    live = ' [LIVE]' if it.get('isLive') else ''
    print(f"{it['id']}  {it['duration'] or it['badge'] or '?':>8}  {it['age']:>15}  {it['channel'][:24]:24}  {it['title'][:80]}{live}")
PY
