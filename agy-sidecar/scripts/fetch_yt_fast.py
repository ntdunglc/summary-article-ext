#!/usr/bin/env python3
"""
Fast non-browser YouTube metadata + transcript fetcher (~0.5-1s).
Usage:
  python3 fetch_yt_fast.py <video_id> [out_transcript_file]
  (or via: uvx --from youtube-transcript-api python3 fetch_yt_fast.py <video_id> [out_file])
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
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


INNERTUBE_CLIENTS = [
    (
        "IOS",
        {"clientName": "IOS", "clientVersion": "20.10.4", "hl": "en", "gl": "US"},
        "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    ),
    (
        "ANDROID",
        {"clientName": "ANDROID", "clientVersion": "20.10.38", "hl": "en", "gl": "US"},
        "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    ),
]


def fmt_ts(sec: float) -> str:
    s = max(0, int(sec))
    h, rem = divmod(s, 3600)
    m, s2 = divmod(rem, 60)
    return f"{h}:{m:02d}:{s2:02d}" if h > 0 else f"{m}:{s2:02d}"


def build_paragraphs(snippets) -> tuple[int, str]:
    paragraphs = []
    cur_text = []
    cur_ts = ""
    char_len = 0
    count = 0
    for start_sec, raw_txt in snippets:
        txt = html.unescape((raw_txt or "").replace("\n", " ").strip())
        txt = re.sub(r"\s+", " ", txt)
        if not txt:
            continue
        count += 1
        if cur_text and char_len > 250:
            paragraphs.append(f"[{cur_ts}] {' '.join(cur_text)}")
            cur_text = []
            cur_ts = ""
            char_len = 0
        if not cur_ts:
            cur_ts = fmt_ts(start_sec)
        cur_text.append(txt)
        char_len += len(txt) + 1
    if cur_text:
        paragraphs.append(f"[{cur_ts}] {' '.join(cur_text)}")
    return count, "\n\n".join(paragraphs)


def pick_caption_track(tracks: list) -> dict | None:
    if not tracks:
        return None
    def score(t: dict) -> tuple[int, int]:
        lang = (t.get("languageCode") or "").lower()
        is_asr = 1 if t.get("kind") == "asr" else 0
        if lang == "en":
            return (0, is_asr)
        if lang.startswith("en"):
            return (1, is_asr)
        return (2, is_asr)
    return min(tracks, key=score)


def parse_caption_payload(raw_bytes: bytes) -> list[tuple[float, str]]:
    text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return []
    if text.startswith("{"):
        data = json.loads(text)
        out = []
        for ev in data.get("events") or []:
            segs = ev.get("segs") or []
            chunk = "".join(s.get("utf8", "") for s in segs).strip()
            if chunk:
                start_ms = float(ev.get("tStartMs") or 0.0)
                out.append((start_ms / 1000.0, chunk))
        return out

    root = ET.fromstring(text)
    out = []
    for node in root.findall(".//text"):
        txt = "".join(node.itertext()).strip()
        if txt:
            out.append((float(node.attrib.get("start") or 0.0), txt))
    if out:
        return out
    for node in root.findall(".//p"):
        txt = "".join(node.itertext()).strip()
        if txt:
            out.append((float(node.attrib.get("t") or 0.0) / 1000.0, txt))
    return out


def fetch_publish_date_next(video_id: str) -> str:
    try:
        req = urllib.request.Request(
            "https://www.youtube.com/youtubei/v1/next?prettyPrint=false",
            data=json.dumps({
                "context": {"client": {"clientName": "WEB", "clientVersion": "2.20261110.00.00", "hl": "en", "gl": "US"}},
                "videoId": video_id,
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            body = r.read().decode("utf-8", errors="replace")
        m = re.search(r'"publishDate"\s*:\s*"([^"]+)"', body)
        if m:
            return m.group(1)
        m = re.search(r'"dateText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"', body)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "N/A"


def fetch_via_innertube(video_id: str) -> tuple[dict, int, str]:
    meta = {
        "title": "",
        "channel": "",
        "durationSec": 0,
        "duration": "N/A",
        "publishDate": "N/A",
        "views": "N/A",
        "description": "",
    }
    last_err = None
    for _, client_ctx, ua in INNERTUBE_CLIENTS:
        try:
            req = urllib.request.Request(
                "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
                data=json.dumps({"context": {"client": client_ctx}, "videoId": video_id}).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": ua},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                pr = json.loads(resp.read().decode("utf-8", errors="replace"))

            vd = pr.get("videoDetails") or {}
            mf = (pr.get("microformat") or {}).get("playerMicroformatRenderer") or {}
            if vd.get("title"):
                meta["title"] = vd.get("title") or meta["title"]
            if vd.get("author") or mf.get("ownerChannelName"):
                meta["channel"] = vd.get("author") or mf.get("ownerChannelName") or meta["channel"]
            dur_sec = int(vd.get("lengthSeconds") or mf.get("lengthSeconds") or 0)
            if dur_sec > 0:
                meta["durationSec"] = dur_sec
                meta["duration"] = fmt_ts(dur_sec)
            pub = mf.get("publishDate") or mf.get("uploadDate")
            if pub:
                meta["publishDate"] = pub
            vc = vd.get("viewCount") or mf.get("viewCount")
            if vc and str(vc).isdigit():
                meta["views"] = f"{int(vc):,} views"
            if vd.get("shortDescription"):
                meta["description"] = vd.get("shortDescription") or ""

            tracks = ((pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks") or []
            track = pick_caption_track(tracks)
            if not track or not track.get("baseUrl"):
                status = (pr.get("playabilityStatus") or {}).get("status") or "UNKNOWN"
                reason = (pr.get("playabilityStatus") or {}).get("reason") or "No caption tracks"
                last_err = f"{status}: {reason}"
                continue

            base_url = track["baseUrl"]
            snippets = []
            for url in (f"{base_url}&fmt=json3", base_url):
                try:
                    treq = urllib.request.Request(url, headers={"User-Agent": ua})
                    with urllib.request.urlopen(treq, timeout=10) as tr:
                        snippets = parse_caption_payload(tr.read())
                    if snippets:
                        break
                except Exception as te:
                    last_err = str(te)

            if snippets:
                if meta["publishDate"] == "N/A":
                    meta["publishDate"] = fetch_publish_date_next(video_id)
                seg_count, transcript_text = build_paragraphs(snippets)
                if seg_count > 0:
                    return meta, seg_count, transcript_text
        except Exception as e:
            last_err = str(e)
    raise RuntimeError(last_err or "InnerTube returned no captions")


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


def fetch_via_yt_transcript_api(video_id: str):
    from youtube_transcript_api import YouTubeTranscriptApi
    ytt = YouTubeTranscriptApi()
    try:
        snippets = list(ytt.fetch(video_id, languages=["en", "en-US", "en-GB"]))
    except Exception:
        tlist = ytt.list(video_id)
        first = next(iter(tlist))
        snippets = list(first.fetch())
    return build_paragraphs((float(getattr(s, "start", 0.0)), getattr(s, "text", "")) for s in snippets)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing video_id"}))
        sys.exit(1)
    video_id = sys.argv[1].strip()
    out_file = sys.argv[2].strip() if len(sys.argv) > 2 else ""

    meta = None
    seg_count = 0
    transcript_text = ""
    err_msg = ""

    try:
        meta, seg_count, transcript_text = fetch_via_innertube(video_id)
    except Exception as e:
        err_msg = str(e)
        meta = fetch_watch_metadata(video_id)
        try:
            seg_count, transcript_text = fetch_via_yt_transcript_api(video_id)
        except Exception as e2:
            print(json.dumps({"ok": False, "id": video_id, "error": f"{err_msg}; fallback: {e2}", **meta}))
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
