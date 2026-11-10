#!/bin/zsh
# Usage: extract.sh <video_id> <out_file>
# Extracts metadata + description + transcript using summary-article-ext's own
# youtubeExtractor.getTranscript() (sites/youtube.js), injected into the watch page.
set -e
source "${0:A:h}/common.sh"
[[ "$1" == "--" ]] && shift   # allow `extract.sh -- -XYZ...` for IDs starting with '-'
VID=$1; OUT=$2
open_url "https://www.youtube.com/watch?v=$VID"
$=AB wait --fn "!!document.querySelector('ytd-watch-metadata #title h1')" >/dev/null
sleep 2
ensure_yt_tab
CUT=$(grep -n "Self-contained button injector" "$EXT_JS" | cut -d: -f1)
JS=$(mktemp /tmp/ytx.XXXXXX)
{
  head -n $((CUT - 1)) "$EXT_JS"
  cat <<'EOF'
;window.__ytx = null; (async () => {
  try { document.querySelector('video')?.pause(); } catch(_){}
  const X = window.youtubeExtractor;
  X.sendLog = () => {};
  const r = await X.getTranscript();
  const pr = window.ytInitialPlayerResponse || {};
  const mf = pr.microformat?.playerMicroformatRenderer || {};
  const vd = pr.videoDetails || {};
  const title = vd.title || mf.title?.simpleText || document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string')?.textContent?.trim();
  const channel = vd.author || document.querySelector('ytd-watch-metadata ytd-channel-name #text')?.textContent?.trim();
  const info = document.querySelector('ytd-watch-info-text #info, ytd-watch-metadata #info')?.textContent?.trim();
  const desc = (mf.description?.simpleText || vd.shortDescription || document.querySelector('#description-inline-expander')?.innerText || '').trim();
  window.__ytx = `TITLE: ${title}
CHANNEL: ${channel}
URL: https://www.youtube.com/watch?v=${vd.videoId || ''}
DURATION: ${X.getVideoDurationFormatted()}
PUBLISH_DATE: ${mf.publishDate || mf.uploadDate || ''}
VIEWS: ${vd.viewCount || ''}
CATEGORY: ${mf.category || ''}
INFO: ${info}
SEGMENTS: ${r?.count || 0} (${r?.firstTimestamp} -> ${r?.lastTimestamp})

<description>
${desc}
</description>

<transcript>
${r?.text || 'UNAVAILABLE'}
</transcript>`;
})().catch(e => { window.__ytx = 'ERROR: ' + e; }); 'started'
EOF
} > "$JS"
# Fire-and-poll: start extraction in the page, then poll window.__ytx. A single long-running
# eval can exceed agent-browser's client timeout ("Resource temporarily unavailable").
for attempt in 1 2; do
  $=AB eval --stdin < "$JS" >/dev/null 2>&1 || true
  for i in $(seq 1 60); do
    sleep 2
    $=AB eval "window.__ytx" 2>/dev/null | python3 -c 'import sys,json; v=json.loads(sys.stdin.read() or "null"); print(v) if v else sys.exit(1)' > "$OUT" 2>/dev/null && break
  done
  grep -q "^SEGMENTS: [1-9]" "$OUT" 2>/dev/null && break
  echo "attempt $attempt: no transcript yet; retrying..." >&2
  ensure_yt_tab
done
rm -f "$JS"
head -10 "$OUT"
echo "bytes: $(wc -c < "$OUT")"
