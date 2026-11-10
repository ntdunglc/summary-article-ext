#!/bin/zsh
# Shared helpers for yt-daily-digest scripts.
SESSION=${YT_SESSION:-yt-digest}
AB="agent-browser --session $SESSION"
EXT_JS="$HOME/workspace/summary-article-ext/sites/youtube.js"

# Extensions in the Default profile (e.g. Tampermonkey changelog) can open tabs and
# steal focus. Close known noise tabs and switch back to the YouTube tab.
ensure_yt_tab() {
  local tabs
  tabs=$($=AB tab 2>/dev/null)
  echo "$tabs" | grep -E "tampermonkey\.net|chrome-extension://" | grep -oE "\[t[0-9]+\]" | tr -d '[]' | while read t; do
    $=AB tab close "$t" >/dev/null 2>&1
  done
  local yt
  yt=$($=AB tab 2>/dev/null | grep "youtube.com" | head -1 | grep -oE "\[t[0-9]+\]" | tr -d '[]')
  [[ -n "$yt" ]] && $=AB tab "$yt" >/dev/null 2>&1
  return 0
}

open_url() {
  $=AB --profile Default open "$1" >/dev/null 2>&1 || $=AB open "$1" >/dev/null
  sleep 2
  ensure_yt_tab
}
