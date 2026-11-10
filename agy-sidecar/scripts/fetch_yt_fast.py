#!/usr/bin/env python3
"""
Fast non-browser YouTube metadata + transcript fetcher (~1s).
Usage:
  uv run --with youtube-transcript-api python3 fetch_yt_fast.py <video_id> [out_transcript_file]
Outputs JSON to stdout:
  {
    "ok": true,
    "id": "...",
    "title": "...",
    "channel": "...",
    "duration": "19:42",
    "durationSec": 1182,
    "publishDate": "2026-11-09",
    "views": "1,234 views",
    "description": "...",
    "segments": 629,
    "transcript": "[0:01] ...\n\n[0:37] ..."
  }
"""
import html
import json
import re
import sys
import urllib.request
from youtube_transcript_api import YouTubeTranscriptApi


def fmt_ts(sec: float) -> str:
    s = max(0, int(sec))
    h, rem = divmod(s, 3600)
    m, s2 = divmod(rem, 60)
    return f"{h}:{m:02d}:{s2:02d}" if h > 0 else f"{m}:{s2:02d}"


def fetch_watch_metadata(video_id: str) -> dict:
    url = f"https://www.youtube.com/watch?v={video_id}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    meta = {
        "title": "",
        "channel": "",
        "durationSec": 0,
        "duration": "N/A",
        "publishDate": "N/A",
        "views": "N/A",
        "description": "",
    }
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            page = resp.read().decode("utf-8", errors="replace")
        m = re.search(r"ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|</script>)", page, re.S)
        if m:
            pr = json.loads(m.group(1))
            vd = pr.get("videoDetails") or {}
            mf = (pr.get("microformat") or {}).get("playerMicroformatRenderer") or {}
            meta["title"] = vd.get("title") or ""
            meta["channel"] = vd.get("author") or mf.get("ownerChannelName") or ""
            dur_sec = int(vd.get("lengthSeconds") or mf.get("lengthSeconds") or 0)
            meta["durationSec"] = dur_sec
            if dur_sec > 0:
                meta["duration"] = fmt_ts(dur_sec)
            meta["publishDate"] = mf.get("publishDate") or mf.get("uploadDate") or "N/A"
            vc = vd.get("viewCount") or mf.get("viewCount")
            if vc and str(vc).isdigit():
                meta["views"] = f"{int(vc):,} views"
            meta["description"] = vd.get("shortDescription") or ""
    except Exception:
        pass
    return meta


def fetch_transcript(video_id: str):
    ytt = YouTubeTranscriptApi()
    try:
        snippets = list(ytt.fetch(video_id, languages=["en", "en-US", "en-GB"]))
    except Exception:
        tlist = ytt.list(video_id)
        first = next(iter(tlist))
        snippets = list(first.fetch())

    paragraphs = []
    cur_text = []
    cur_ts = ""
    char_len = 0
    for sn in snippets:
        txt = html.unescape((sn.text or "").replace("\n", " ").strip())
        if not txt:
            continue
        if cur_text and char_len > 250:
            paragraphs.append(f"[{cur_ts}] {' '.join(cur_text)}")
            cur_text = []
            cur_ts = ""
            char_len = 0
        if not cur_ts:
            cur_ts = fmt_ts(sn.start)
        cur_text.append(txt)
        char_len += len(txt) + 1
    if cur_text:
        paragraphs.append(f"[{cur_ts}] {' '.join(cur_text)}")
    return len(snippets), "\n\n".join(paragraphs)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing video_id"}))
        sys.exit(1)
    video_id = sys.argv[1].strip()
    out_file = sys.argv[2].strip() if len(sys.argv) > 2 else ""

    meta = fetch_watch_metadata(video_id)
    try:
        seg_count, transcript_text = fetch_transcript(video_id)
    except Exception as e:
        print(json.dumps({"ok": False, "id": video_id, "error": str(e), **meta}))
        sys.exit(1)

    if out_file:
        header = [
            f"VIDEO_ID: {video_id}",
            f"URL: https://www.youtube.com/watch?v={video_id}",
            f"TITLE: {meta['title']}",
            f"CHANNEL: {meta['channel']}",
            f"DURATION: {meta['duration']} ({meta['durationSec']}s)",
            f"PUBLISH_DATE: {meta['publishDate']}",
            f"VIEWS: {meta['views']}",
            f"SEGMENTS: {seg_count}",
            "",
            "--- DESCRIPTION ---",
            meta["description"] or "N/A",
            "",
            "--- TRANSCRIPT ---",
            transcript_text,
            "",
        ]
        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(header))

    print(
        json.dumps(
            {
                "ok": True,
                "id": video_id,
                **meta,
                "segments": seg_count,
                "transcript": transcript_text,
            }
        )
    )


if __name__ == "__main__":
    main()
