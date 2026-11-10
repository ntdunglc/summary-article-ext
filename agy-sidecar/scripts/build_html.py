"""Build the daily digest HTML (sidebar tab per video + Overview tab).

Usage: uv run --with markdown python build_html.py <day_dir>
  <day_dir>/selection.json   {"selected": [{"id", "reason"}...], "skipped": [{"title","channel","duration","url","reason"}...]}
  <day_dir>/reports/<id>.md  one report per selected video (starting with `### Video Metadata`)
Writes <day_dir>/index.html and regenerates digests/index.html (list of all days).
"""
import html
import json
import re
import sys
from pathlib import Path

import markdown

DAY = Path(sys.argv[1]).resolve()
REPORTS = DAY / "reports"
OUT = DAY / "index.html"
SEL = json.loads((DAY / "selection.json").read_text())

ORDER = [s["id"] for s in SEL["selected"] if (REPORTS / f"{s['id']}.md").exists()]
missing = [s["id"] for s in SEL["selected"] if s["id"] not in ORDER]
if missing:
    print("WARNING: missing reports for", missing)
videos = []
for vid in ORDER:
    body = (REPORTS / f"{vid}.md").read_text().strip()
    t = re.search(r"\*\*Title:\*\*\s*(.+)", body)
    title = t.group(1).strip() if t else vid
    title = re.sub(r"\s+-\s+[^-]+,\s*[^,]+$", "", title)  # drop " - Speaker, Company" suffix
    videos.append(f"## {len(videos) + 1}. {title}\n\n{body}")


def to_seconds(ts: str) -> int:
    parts = [int(p) for p in ts.split(":")]
    s = 0
    for p in parts:
        s = s * 60 + p
    return s


def md_to_html(md_text: str, video_url: str) -> str:
    md_text = md_text.replace("\\$", "&#36;")
    md_text = re.sub(r"\$([^$\n]+)\$", lambda m: f"<code>{html.escape(m.group(1))}</code>", md_text)
    md_text = md_text.replace("\\hat{H}\\Psi", "ĤΨ").replace("\\tfrac{1}{2}", "½")
    # autolink bare URLs (not already in markdown link/angle brackets)
    md_text = re.sub(r"(?<![(<\"])(https?://[^\s)<>]+)", r"<\1>", md_text)
    out = markdown.markdown(md_text, extensions=["tables", "sane_lists", "nl2br"], tab_length=2)
    out = out.replace("<a href=", '<a target="_blank" rel="noopener" href=')

    def ts_link(m):
        start, end, rest = m.group(1), m.group(2), m.group(3)
        url = f"{video_url}&amp;t={to_seconds(start)}s" if "?" in video_url else video_url
        return (f'<h4><a class="ts" target="_blank" rel="noopener" href="{url}">'
                f"{start} – {end}</a> {rest}</h4>")

    out = re.sub(r"<h4>\[(\d+:\d+(?::\d+)?) - (\d+:\d+(?::\d+)?)\]\s*(.*?)</h4>", ts_link, out)
    return out


reason_by_id = {s["id"]: s.get("reason", "") for s in SEL["selected"]}


def overview_panel() -> str:
    rows = []
    for vid in ORDER:
        body = (REPORTS / f"{vid}.md").read_text()
        t = re.search(r"\*\*Title:\*\*\s*(.+)", body)
        title = (t.group(1).strip() if t else vid).replace("\\$", "$")
        rows.append(f'<li><a href="#{vid}" class="ov-link" data-id="{vid}">{html.escape(title)}</a>'
                    f'<span class="why">{html.escape(reason_by_id.get(vid, ""))}</span></li>')
    skipped = []
    for s in SEL.get("skipped", []):
        label = html.escape(s.get("title", ""))
        if s.get("url"):
            label = f'<a href="{html.escape(s["url"])}" target="_blank" rel="noopener">{label}</a>'
        meta = " · ".join(x for x in [s.get("channel", ""), s.get("duration", "")] if x)
        skipped.append(f'<li>{label} <span class="muted">{html.escape(meta)}</span>'
                       f'<span class="why">{html.escape(s.get("reason", ""))}</span></li>')
    return f"""
    <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" tabindex="0">
      <header class="hero"><div>
        <h1>Daily Digest · {DAY.name}</h1>
        <p class="sub">{len(ORDER)} summarized · {len(skipped)} skipped from your subscriptions feed</p>
      </div></header>
      <article class="md">
        <h3>Summarized</h3><ul class="ov">{''.join(rows)}</ul>
        <h3>Skipped</h3><ul class="ov">{''.join(skipped) or '<li>None</li>'}</ul>
      </article>
    </section>"""


tabs = [f"""
      <button role="tab" id="tab-overview" aria-controls="panel-overview" aria-selected="true" tabindex="0" data-id="overview" class="ov-tab">
        <span class="ov-icon" aria-hidden="true">☰</span>
        <span class="t-title">Overview</span>
        <span class="t-meta">{len(ORDER)} videos · {DAY.name}</span>
      </button>"""]
panels = [overview_panel()]
for i, sec in enumerate(videos):
    m = re.match(r"## \d+\.\s*(.+)", sec)
    title = m.group(1).replace("\\$", "$") if m else f"Video {i+1}"
    body = sec[m.end():].strip() if m else sec
    url = re.search(r"\*\*URL:\*\*\s*(\S+)", body).group(1)
    vid = re.search(r"v=([\w-]+)", url).group(1)
    channel = re.search(r"\*\*Channel:\*\*\s*(.+)", body).group(1).strip()
    channel = re.sub(r"\s*\(.*\)$", "", channel)  # short form for sidebar/header
    duration = re.search(r"\*\*Duration:\*\*\s*([\d:]+)", body).group(1)
    thumb = f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
    sel = "false"
    tabs.append(f"""
      <button role="tab" id="tab-{vid}" aria-controls="panel-{vid}" aria-selected="{sel}" tabindex="-1" data-id="{vid}">
        <img src="{thumb}" alt="" loading="lazy" width="320" height="180">
        <span class="t-title">{html.escape(title)}</span>
        <span class="t-meta">{html.escape(channel)} · {duration}</span>
      </button>""")
    panels.append(f"""
    <section role="tabpanel" id="panel-{vid}" aria-labelledby="tab-{vid}" tabindex="0" hidden>
      <header class="hero">
        <a href="{html.escape(url)}" target="_blank" rel="noopener" class="hero-thumb">
          <img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="Thumbnail: {html.escape(title)}" width="480" height="360">
          <span class="play" aria-hidden="true">▶</span>
        </a>
        <div>
          <h1>{html.escape(title)}</h1>
          <p class="sub">{html.escape(channel)} · {duration}</p>
          <a class="btn" href="{html.escape(url)}" target="_blank" rel="noopener">Watch on YouTube ↗</a>
        </div>
      </header>
      <article class="md">{md_to_html(body, url)}</article>
    </section>""")

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>YouTube Digest · {DAY.name}</title>
<style>
  :root {{
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --side: #f6f8fa; --border: #d1d9e0;
    --accent: #cc0000; --sel: #ffebe9; --code: #eff1f3;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --side: #151b23; --border: #3d444d;
      --accent: #ff6b6b; --sel: #2d1b1f; --code: #262c36;
    }}
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: var(--bg); color: var(--fg); }}
  body {{ display: grid; grid-template-columns: 320px 1fr; align-items: start; min-height: 100dvh; }}
  nav {{
    position: sticky; top: 0; height: 100dvh; overflow-y: auto;
    background: var(--side); border-right: 1px solid var(--border); padding: 16px 12px;
  }}
  nav h2 {{ font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 4px 8px 12px; }}
  [role="tablist"] {{ display: flex; flex-direction: column; gap: 6px; }}
  [role="tab"] {{
    all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 112px 1fr;
    grid-template-rows: auto auto; column-gap: 10px; row-gap: 2px; padding: 8px; border-radius: 10px;
    border: 1px solid transparent;
  }}
  [role="tab"] img {{ grid-row: span 2; width: 112px; height: 63px; object-fit: cover; border-radius: 6px; background: var(--code); }}
  [role="tab"] .t-title {{ font-size: 13.5px; font-weight: 600; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }}
  [role="tab"] .t-meta {{ font-size: 12px; color: var(--muted); }}
  [role="tab"]:hover {{ background: color-mix(in srgb, var(--sel) 60%, transparent); }}
  [role="tab"][aria-selected="true"] {{ background: var(--sel); border-color: var(--accent); }}
  [role="tab"]:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
  main {{ min-width: 0; }}
  nav h2 a {{ color: inherit; }}
  .ov-tab {{ grid-template-columns: 112px 1fr; }}
  .ov-icon {{ grid-row: span 2; width: 112px; height: 48px; display: grid; place-items: center; font-size: 22px;
    background: var(--code); border-radius: 6px; }}
  .md ul.ov li {{ margin: 10px 0; }}
  .md .why {{ display: block; color: var(--muted); font-size: 14px; }}
  .md .muted {{ color: var(--muted); font-size: 13px; }}
  [role="tabpanel"] {{ max-width: 920px; margin: 0 auto; padding: 32px 40px 80px; }}
  [role="tabpanel"]:focus-visible {{ outline: none; }}
  .hero {{ display: flex; gap: 24px; align-items: center; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }}
  .hero-thumb {{ position: relative; flex: 0 0 280px; }}
  .hero-thumb img {{ width: 280px; height: 158px; object-fit: cover; border-radius: 12px; display: block; }}
  .play {{ position: absolute; inset: 0; display: grid; place-items: center; font-size: 40px; color: #fff;
    text-shadow: 0 2px 12px rgb(0 0 0 / .6); opacity: .85; }}
  .hero h1 {{ font-size: 24px; margin: 0 0 6px; line-height: 1.25; }}
  .sub {{ color: var(--muted); margin: 0 0 14px; }}
  .btn {{ display: inline-block; background: var(--accent); color: #fff; text-decoration: none; padding: 8px 14px;
    border-radius: 999px; font-size: 14px; font-weight: 600; }}
  .md {{ line-height: 1.65; font-size: 15.5px; }}
  .md h3 {{ font-size: 20px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }}
  .md h4 {{ font-size: 16px; margin: 22px 0 6px; }}
  .md a {{ color: var(--accent); }}
  .md a.ts {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; text-decoration: none;
    background: var(--code); padding: 2px 8px; border-radius: 6px; margin-right: 4px; }}
  .md a.ts:hover {{ text-decoration: underline; }}
  .md code {{ background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: .9em; }}
  .md hr {{ border: 0; border-top: 1px solid var(--border); margin: 28px 0; }}
  .md ul {{ padding-left: 22px; }}
  .md li {{ margin: 4px 0; }}
  .md blockquote {{ margin: 0; padding: 4px 16px; border-left: 4px solid var(--accent); color: var(--muted); }}
  .md table {{ border-collapse: collapse; width: 100%; }}
  .md th, .md td {{ border: 1px solid var(--border); padding: 6px 10px; text-align: left; }}
  @media (max-width: 800px) {{
    body {{ grid-template-columns: 1fr; }}
    nav {{ position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); }}
    [role="tabpanel"] {{ padding: 20px 16px 60px; }}
    .hero {{ flex-direction: column; align-items: flex-start; }}
  }}
</style>
</head>
<body>
  <nav aria-label="Videos">
    <h2><a href="../index.html">All digests</a> · {DAY.name}</h2>
    <div role="tablist" aria-orientation="vertical" aria-label="Video summaries">{''.join(tabs)}
    </div>
  </nav>
  <main>{''.join(panels)}
  </main>
<script>
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function select(tab, focus = true) {{
    for (const t of tabs) {{
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }}
    if (focus) tab.focus();
    history.replaceState(null, '', '#' + tab.dataset.id);
    window.scrollTo({{ top: 0 }});
  }}
  for (const t of tabs) {{
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {{
      const i = tabs.indexOf(t);
      const next = {{ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }}[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length]);
    }});
  }}
  for (const a of document.querySelectorAll('.ov-link')) {{
    a.addEventListener('click', e => {{ e.preventDefault(); select(tabs.find(t => t.dataset.id === a.dataset.id)); }});
  }}
  const initial = tabs.find(t => t.dataset.id === location.hash.slice(1));
  if (initial) select(initial, false);
</script>
</body>
</html>
"""
OUT.write_text(page)
print(OUT)

# Regenerate the digest index (all days, newest first)
root = DAY.parent
days = sorted([d for d in root.iterdir() if (d / "index.html").exists()], reverse=True)
items = []
for d in days:
    try:
        n = len(json.loads((d / "selection.json").read_text())["selected"])
    except Exception:
        n = "?"
    items.append(f'<li><a href="{d.name}/index.html">{d.name}</a> <span>{n} videos</span></li>')
(root / "index.html").write_text(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>YouTube Daily Digests</title><style>:root{{color-scheme:light dark;font-family:system-ui,sans-serif}}
body{{max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6}} a{{color:#cc0000}}
@media (prefers-color-scheme: dark){{a{{color:#ff6b6b}}}} li span{{opacity:.65;font-size:14px;margin-left:8px}}</style></head>
<body><h1>YouTube Daily Digests</h1><ul>{''.join(items)}</ul></body></html>""")
print(root / "index.html")
