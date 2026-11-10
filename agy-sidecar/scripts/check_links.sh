#!/bin/zsh
# Usage: check_links.sh <reports_dir>
# Prints HTTP status for every URL cited in the reports. Flags redirect/search URLs.
DIR=$1
grep -h -o -E 'https?://([^ ()<>"`*]|\([^ ()<>"`*]*\))+' "$DIR"/*.md | sed -E 's/[.,;:]+$//' | sort -u | while read u; do
  case "$u" in
    *vertexaisearch*|*google.com/search*) echo "BAD-REDIRECT $u"; continue;;
    *youtube.com/watch*) continue;;
  esac
  code=$(curl -s -o /dev/null -L -m 12 -A "Mozilla/5.0" -w "%{http_code}" "$u")
  echo "$code $u"
done
echo "--- files citing redirect/search URLs:"
grep -l -E "vertexaisearch|google\.com/search" "$DIR"/*.md || echo "(none)"
