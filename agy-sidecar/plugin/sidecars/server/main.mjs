// YouTube Digest sidecar: always-on server that
//   1. scrapes the signed-in YouTube subscriptions feed every hour (agent-browser, Default Chrome profile),
//   2. pre-filters + asks a Gemini Flash agent (agentapi) to pick long-form / technical videos,
//   3. extracts transcripts with summary-article-ext's own extractor (scripts/extract.sh),
//   4. spawns one Gemini Flash agent conversation per video to write the report,
//   5. serves a panel listing summaries, the queue, and skipped videos (one-click "Summarize").
//
// Reports/transcripts live in the user's workspace (agents must be able to write there);
// server state lives in ANTIGRAVITY_EXECUTABLE_DATA_DIR.

import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';
import { marked } from './vendor/marked.esm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(homedir(), 'workspace', 'yt-daily-digest');
const SCRIPTS = join(ROOT, 'scripts');
const LIB = join(ROOT, 'library');
const DIRS = {
  transcripts: join(LIB, 'transcripts'),
  reports: join(LIB, 'reports'),
  errors: join(LIB, 'errors'),
  selections: join(LIB, 'selections'),
  prompts: join(LIB, 'prompts'),
};
const EXT_JS = join(homedir(), 'workspace', 'summary-article-ext', 'sites', 'youtube.js');
const AGENTAPI = join(homedir(), '.gemini', 'antigravity', 'bin', 'agentapi');
const DATA_DIR = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(HERE, '.data');
const STATE_FILE = join(DATA_DIR, 'state.json');

const CFG = {
  scrapeEveryMs: 60 * 60 * 1000,      // hourly feed check
  candidateMaxAgeH: 30,               // only auto-consider uploads newer than this
  minAutoSec: 8 * 60,                 // auto-skip anything shorter
  maxAutoPerDay: Infinity,            // no daily cap: summarize every long technical video
  maxConcurrentAgents: 3,             // parallel report agents
  reportTimeoutMs: 30 * 60 * 1000,
  selectTimeoutMs: 12 * 60 * 1000,
  model: 'neon',
  tz: 'America/New_York',
};

for (const d of [DATA_DIR, ...Object.values(DIRS)]) mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = loadState();
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { videos: {}, log: [], lastScrapeAt: null, nextScrapeAt: null }; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 1));
    renameSync(tmp, STATE_FILE);
  }, 200);
}
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  state.log = [line, ...(state.log || [])].slice(0, 200);
  save();
}
function setStatus(v, status, extra = {}) {
  Object.assign(v, extra, { status, updatedAt: Date.now() });
  save();
}
const nyDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: CFG.tz }).format(new Date(ms));
const reportPath = (id) => join(DIRS.reports, `${id}.md`);
const transcriptPath = (id) => join(DIRS.transcripts, `${id}.txt`);
const errorPath = (id) => join(DIRS.errors, `${id}.txt`);

// ---------------------------------------------------------------------------
// Process helpers (no shell; args as arrays)
// ---------------------------------------------------------------------------
function run(cmd, args, { timeoutMs = 10 * 60 * 1000, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd: ROOT });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); err += '\n[timeout]'; }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
  });
}

// All agent-browser use shares one Chrome session, so serialize it.
let browserChain = Promise.resolve();
const withBrowser = (fn) => {
  const p = browserChain.then(fn, fn);
  browserChain = p.catch(() => {});
  return p;
};
const BROWSER_ENV = { YT_SESSION: 'yt-server' };
const closeBrowser = () => run('agent-browser', ['--session', 'yt-server', 'close'], { timeoutMs: 20000 });

function startAgent(title, prompt) {
  return startDirectCascade({ title, prompt, prefix: 'YT Digest', modelKey: CFG.model })
    .catch((err) => {
      log(`Direct StartCascade failed (${err.message}); falling back to agentapi`);
      return run(AGENTAPI, ['new-conversation', `--model=${CFG.model}`, `--title=${title}`, prompt], { timeoutMs: 60000 })
        .then(({ code, out, err: e2 }) => {
          const m = (out + e2).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
          if (code !== 0) log(`agentapi exited ${code}: ${(e2 || out).slice(0, 300)}`);
          return { ok: code === 0, conversationId: m ? m[0] : null };
        });
    });
}

// ---------------------------------------------------------------------------
// Feed scraping + selection
// ---------------------------------------------------------------------------
function ageHours(age) {
  const m = /(\d+)\s*(second|sec|minute|min|hour|h\b|day|d\b|week|w\b|month|mo\b|year|y\b)/i.exec(age || '');
  if (!m) return null;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  if (u.startsWith('s')) return n / 3600;
  if (u.startsWith('min')) return n / 60;
  if (u.startsWith('h')) return n;
  if (u.startsWith('d')) return n * 24;
  if (u.startsWith('w')) return n * 24 * 7;
  if (u.startsWith('mo')) return n * 24 * 30;
  return n * 24 * 365;
}

let scraping = false;
async function scrapeFeed(reason = 'scheduled') {
  if (scraping) return { ok: false, error: 'already scraping' };
  scraping = true;
  log(`Feed check (${reason})`);
  try {
    const out = join(DATA_DIR, 'feed.json');
    const res = await withBrowser(async () => {
      const r = await run('/bin/zsh', [join(SCRIPTS, 'scrape_feed.sh'), out], { timeoutMs: 5 * 60 * 1000, env: BROWSER_ENV });
      if (!hasQueuedExtraction()) await closeBrowser();
      return r;
    });
    let feed;
    try { feed = JSON.parse(readFileSync(out, 'utf8')); } catch { feed = null; }
    if (!feed || res.code !== 0) throw new Error(`scrape failed: ${(res.err || res.out).slice(-400)}`);
    if (!feed.signedIn) throw new Error('YouTube appears signed out in the Default Chrome profile');
    const now = Date.now();
    let added = 0;
    for (const it of feed.items) {
      const ah = ageHours(it.age);
      const existing = state.videos[it.id];
      if (existing) {
        existing.views = it.views;
        // Premieres/upcoming videos get a duration once published: re-evaluate them then.
        if (existing.status === 'skipped' && /^(No duration|Upcoming)/.test(existing.decision?.reason || '') && it.durationSec && !it.isLive) {
          Object.assign(existing, { duration: it.duration, durationSec: it.durationSec, publishedAt: ah == null ? now : now - ah * 3600e3 });
          setStatus(existing, 'new', { decision: null });
          added++;
        }
        continue;
      }
      added++;
      const v = state.videos[it.id] = {
        id: it.id, url: it.url, title: it.title, channel: it.channel, duration: it.duration,
        durationSec: it.durationSec, isLive: !!it.isLive, ageAtFirstSeen: it.age,
        publishedAt: ah == null ? now : now - ah * 3600e3, firstSeenAt: now, status: 'new', updatedAt: now,
      };
      if (existsSync(reportPath(v.id))) setStatus(v, 'done', { decision: { by: 'import', reason: 'Already summarized' } });
    }
    state.lastScrapeAt = now;
    state.lastScrapeError = null;
    log(`Feed: ${feed.items.length} items, ${added} new`);
    await selectNew();
    return { ok: true, added };
  } catch (e) {
    state.lastScrapeError = String(e.message || e);
    log(`Feed check failed: ${state.lastScrapeError}`);
    return { ok: false, error: state.lastScrapeError };
  } finally {
    scraping = false;
    state.nextScrapeAt = Date.now() + CFG.scrapeEveryMs;
    save();
  }
}

function slotsUsedToday() {
  const today = nyDate(Date.now());
  return Object.values(state.videos)
    .filter((v) => v.decision?.by === 'auto' && v.decision?.select && nyDate(v.decision.at || 0) === today)
    .reduce((n) => n + 1, 0);
}

const skip = (v, reason, by = 'auto') => setStatus(v, 'skipped', { decision: { by, select: false, reason, at: Date.now() } });

async function selectNew() {
  const fresh = Object.values(state.videos).filter((v) => v.status === 'new');
  const candidates = [];
  for (const v of fresh) {
    const ageH = (Date.now() - v.publishedAt) / 3600e3;
    if (ageH > CFG.candidateMaxAgeH) skip(v, `Older than ${CFG.candidateMaxAgeH}h when first seen`);
    else if (v.isLive) skip(v, 'LIVE / streamed re-broadcast');
    else if (!v.durationSec) skip(v, /Upcoming|Scheduled/i.test(v.ageAtFirstSeen || '') ? 'Upcoming premiere (re-checked once published)' : 'No duration (Short, premiere or upcoming)');
    else if (v.durationSec < CFG.minAutoSec) skip(v, 'Under 8 minutes');
    else candidates.push(v);
  }
  if (!candidates.length) return;
  const slots = Number.isFinite(CFG.maxAutoPerDay) ? CFG.maxAutoPerDay - slotsUsedToday() : Infinity;
  if (slots <= 0) {
    candidates.forEach((v) => skip(v, 'Daily auto-summary budget reached'));
    return;
  }
  candidates.forEach((v) => setStatus(v, 'selecting'));
  const today = nyDate(Date.now());
  const pickedToday = Object.values(state.videos)
    .filter((v) => v.decision?.select && nyDate(v.decision.at || 0) === today)
    .map((v) => `- ${v.channel}: ${v.title}`).join('\n') || '(none)';
  const outFile = join(DIRS.selections, `${Date.now()}.json`);
  const list = candidates.map((v) => `${v.id} | ${v.duration} | ${v.channel} | ${v.title}`).join('\n');
  const prompt = `You are the video selector for an automated YouTube digest. Do not use the browser, do not run commands, and do not ask questions.
Decide which of these new subscription-feed videos deserve a full written summary.

Priorities:
1. Long-form technical content (>= 20 min) — always select these: AI/ML research and engineering, software engineering, GPUs/semiconductors/systems, science explainers of real papers, deep technical or business history, technical podcasts.
2. Substantive technical talks of 12-20 min (e.g. conference talks from AI Engineer or other tech channels) — always select these too, with NO per-channel cap.
3. Long-form non-technical but serious content (>= 45 min interviews on tech, economics, history, policy) only if few technical picks are available.
Skip pure entertainment, celebrity or motivational content, chess/game commentary, politics punditry, news roundups, trailers, clips, and exact duplicates of an already-picked video. Medical/oncology research topics often fail downstream, so prefer to skip them.
There is NO daily budget and NO per-channel limit: select EVERY video that matches priority 1 or priority 2, even if many come from the same channel (e.g. AI Engineer).

Already picked today (for exact-duplicate detection only):
${pickedToday}

Candidates (id | duration | channel | title):
${list}

Write ONLY a JSON file to ${outFile} with exactly this shape and an entry for EVERY candidate id:
{"decisions": [{"id": "<id>", "select": true, "reason": "<one short sentence>"}]}
After writing the file, reply "done".`;
  log(`Selecting among ${candidates.length} candidate(s)${Number.isFinite(slots) ? `, ${slots} slot(s) left today` : ''}`);
  const started = await startAgent(`YT Digest: select ${candidates.length} videos`, prompt);
  const deadline = Date.now() + CFG.selectTimeoutMs;
  while (Date.now() < deadline) {
    await sleep(10000);
    if (!existsSync(outFile)) continue;
    try {
      const { decisions } = JSON.parse(readFileSync(outFile, 'utf8'));
      applyDecisions(candidates, decisions || [], slots);
      return;
    } catch { /* partially written; keep polling */ }
  }
  log(`Selector agent ${started.conversationId || ''} timed out; using heuristic fallback`);
  applyDecisions(candidates, heuristic(candidates), slots, 'heuristic');
}

function heuristic(cands) {
  return [...cands].sort((a, b) => b.durationSec - a.durationSec)
    .map((v) => ({ id: v.id, select: v.durationSec >= 12 * 60, reason: v.durationSec >= 12 * 60 ? 'Technical talk >= 12 min (heuristic fallback)' : 'Shorter than 12 min (heuristic fallback)' }));
}

function applyDecisions(cands, decisions, slots, by = 'auto') {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  let used = 0;
  for (const v of cands) {
    const d = byId.get(v.id);
    const cost = v.durationSec > 75 * 60 ? 2 : 1;
    if (d?.select && used + cost <= slots) {
      used += cost;
      setStatus(v, 'queued', { queuedAt: Date.now(), decision: { by: 'auto', via: by, select: true, reason: d.reason || '', at: Date.now() } });
    } else {
      skip(v, d ? (d.select ? 'Over daily budget' : d.reason || 'Not selected') : 'No decision returned');
    }
  }
  log(`Selection: ${cands.filter((v) => v.status === 'queued').length} video(s) queued`);
  pump();
}

// ---------------------------------------------------------------------------
// Pipeline: extraction (serial, browser) -> report agent (pool) -> link check
// ---------------------------------------------------------------------------
const hasQueuedExtraction = () => Object.values(state.videos).some((v) => v.status === 'queued');
let extracting = false;

function transcriptOk(id) {
  try { return /^SEGMENTS: [1-9]/m.test(readFileSync(transcriptPath(id), 'utf8').slice(0, 2000)); } catch { return false; }
}

const UVX_BIN = existsSync(join(homedir(), '.local', 'bin', 'uvx')) ? join(homedir(), '.local', 'bin', 'uvx') : 'uvx';
const PYTHON_BIN = existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
const FAST_YT_SCRIPT = join(SCRIPTS, 'fetch_yt_fast.py');

function parseFastYtOutput(out) {
  try {
    const j = JSON.parse(String(out || '').trim());
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

async function fetchYouTubeFast(videoId) {
  const outPath = transcriptPath(videoId);
  const direct = await run(PYTHON_BIN, [FAST_YT_SCRIPT, videoId, outPath], { timeoutMs: 20000 });
  const jDirect = parseFastYtOutput(direct.out);
  if (direct.code === 0 && jDirect?.ok) return jDirect;

  // Fallback to uvx --from youtube-transcript-api if stdlib InnerTube failed
  const viaUvx = await run(UVX_BIN, ['--from', 'youtube-transcript-api', 'python3', FAST_YT_SCRIPT, videoId, outPath], { timeoutMs: 25000 });
  const jUvx = parseFastYtOutput(viaUvx.out);
  if (viaUvx.code === 0 && jUvx?.ok) return jUvx;

  return {
    ok: false,
    error: jUvx?.error || jDirect?.error || (viaUvx.err || direct.err || '').trim().slice(0, 300) || 'Transcript unavailable',
  };
}

function getYouTubePromptTemplate() {
  try {
    const src = readFileSync(EXT_JS, 'utf8');
    const m = src.match(/getPrompt\(\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/);
    if (m) return m[1].replace(/\\`/g, '`').replace(/\\\$/g, '$');
  } catch {}
  return '';
}

async function pump() {
  // Extraction worker
  if (!extracting) {
    const next = Object.values(state.videos).filter((v) => v.status === 'queued').sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))[0];
    if (next) {
      extracting = true;
      (async () => {
        try {
          if (!transcriptOk(next.id)) {
            setStatus(next, 'extracting');
            await fetchYouTubeFast(next.id);
            if (!transcriptOk(next.id)) {
              await withBrowser(async () => {
                await run('/bin/zsh', [join(SCRIPTS, 'extract.sh'), '--', next.id, transcriptPath(next.id)], { timeoutMs: 6 * 60 * 1000, env: BROWSER_ENV });
                if (!hasQueuedExtractionExcept(next.id)) await closeBrowser();
              });
            }
          }
          if (transcriptOk(next.id)) setStatus(next, 'waiting', { error: null });
          else setStatus(next, 'failed', { error: 'Transcript unavailable (captions disabled or extraction failed)' });
        } finally {
          extracting = false;
          pump();
        }
      })();
    }
  }
  // Report agent pool
  const running = Object.values(state.videos).filter((v) => v.status === 'summarizing').length;
  const waiting = Object.values(state.videos).filter((v) => v.status === 'waiting').sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  for (const v of waiting.slice(0, Math.max(0, CFG.maxConcurrentAgents - running))) startReport(v);
}
const hasQueuedExtractionExcept = (id) => Object.values(state.videos).some((v) => v.status === 'queued' && v.id !== id);

function reportPrompt(v) {
  return `Write a YouTube video summary report. You are running unattended: do not ask questions, do NOT use the browser or open YouTube; everything you need is on disk.
INPUTS
- Transcript + metadata: ${transcriptPath(v.id)} (read it fully; use ByteOffset / StartLine to page through if truncated).
- Prompt template to follow EXACTLY: the string returned by getPrompt() in ${EXT_JS}. Read it and follow every instruction: all sections in order, no extra intro/outro, walkthrough headings formatted exactly as \`#### [Start - End] Title\`, grouped into broad thematic chapters (4–6 sections for a 10–25 min video, 6–9 for 25–60 min, 8–12 for 60+ min; never 1–2 min micro-slices) with 2–4 concise bullets per section so the walkthrough takes ~10–15% of watching time to read.
- Use PUBLISH_DATE / VIEWS / DURATION from the file header for the metadata block. Extraction Date: ${new Date().toLocaleString('en-US', { timeZone: CFG.tz })} (America/New_York). Auto-captions often misspell names, products and companies; correct them from context.
- AD & SPONSOR FILTERING (STRICT): Completely filter out and ignore all ads, paid sponsorships, host-read promos, affiliate/promo codes, and channel plugs (subscribe/merch/newsletter). Never mention ads or sponsors anywhere in the report—do not summarize them, do not give them walkthrough timestamps/sections, do not mention that an ad was skipped, and exclude sponsor/affiliate URLs from Footnotes.
FACT-CHECK: Use search_web to verify 2-3 significant claims. Source links must be direct canonical URLs (doi.org, arxiv.org/abs, official sites, Wikipedia, publisher article pages). NEVER output vertexaisearch.cloud.google.com redirect URLs or Google search URLs. If you can't get a direct URL, cite the publication by name without a link.
OUTPUT
- Write ONLY the markdown report (starting with \`### Video Metadata\`) to ${reportPath(v.id)}
- Do NOT use LaTeX \`$...$\` math; write equations in plain text/Unicode. Escape literal dollar signs as \\$.
- If you cannot complete the report for any reason, instead write a one-line explanation to ${errorPath(v.id)}.
- Do not modify any other files. When done, reply with just the output path.`;
}

async function startReport(v) {
  if (existsSync(reportPath(v.id)) && statSync(reportPath(v.id)).size > 800) {
    setStatus(v, 'done', { finishedAt: Date.now(), error: null });
    return;
  }
  const existingConv = await findExistingConversation({ videoId: v.id, title: v.title });
  if (existingConv) {
    v.conversationId = existingConv;
    setStatus(v, 'summarizing', { startedAt: v.startedAt || Date.now(), error: null });
    log(`Reusing existing AGY conversation ${existingConv} for ${v.title}`);
    return;
  }
  for (const p of [errorPath(v.id)]) if (existsSync(p)) renameSync(p, `${p}.${Date.now()}.old`);
  setStatus(v, 'summarizing', { startedAt: Date.now(), error: null });
  const { ok, conversationId } = await startAgent(v.title.slice(0, 80), reportPrompt(v));
  v.conversationId = conversationId;
  if (conversationId) {
    state.sessionsByKey = state.sessionsByKey || {};
    state.sessionsByKey[`yt:${v.id}`] = { conversationId, videoId: v.id, title: v.title, createdAt: Date.now() };
  }
  if (!ok) setStatus(v, 'failed', { error: 'Could not start agent (StartCascade/agentapi failed; see log)' });
  save();
}

// Poll running agents
setInterval(() => {
  for (const v of Object.values(state.videos)) {
    if (v.status !== 'summarizing') continue;
    const rp = reportPath(v.id);
    if (existsSync(rp)) {
      const st = statSync(rp);
      if (st.mtimeMs >= (v.startedAt || 0) - 1000 && st.size > 800 && Date.now() - st.mtimeMs > 20000) {
        setStatus(v, 'done', { finishedAt: Date.now() });
        log(`Report done: ${v.title}`);
        checkLinks(v);
        pump();
        continue;
      }
    }
    if (existsSync(errorPath(v.id))) {
      setStatus(v, 'failed', { error: readFileSync(errorPath(v.id), 'utf8').trim().slice(0, 400) });
      pump();
    } else if (Date.now() - (v.startedAt || 0) > CFG.reportTimeoutMs) {
      setStatus(v, 'failed', { error: 'Timed out after 30 min (likely model quota or safety-filter error; check the agent conversation)' });
      pump();
    }
  }
}, 15000);

async function checkLinks(v) {
  let md;
  try { md = readFileSync(reportPath(v.id), 'utf8'); } catch { return; }
  const urls = [...new Set((md.match(/https?:\/\/(?:[^\s()<>"`*\]]|\([^\s()<>"`*]*\))+/g) || [])
    .map((u) => u.replace(/[.,;:]+$/, '')).filter((u) => !/youtube\.com\/watch/.test(u)))];
  const results = {};
  await Promise.all(urls.map(async (u) => {
    if (/vertexaisearch|google\.com\/search/.test(u)) { results[u] = 'redirect'; return; }
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(u, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(t); results[u] = r.status;
    } catch { results[u] = 0; }
  }));
  v.links = results;
  const broken = Object.entries(results).filter(([, s]) => s === 404 || s === 410 || s === 0 || s === 'redirect').length;
  log(`Links for ${v.id}: ${urls.length} checked, ${broken} broken`);
  save();
}

// ---------------------------------------------------------------------------
// Startup: recover + import earlier digests
// ---------------------------------------------------------------------------
function importDigests() {
  const digests = join(ROOT, 'digests');
  if (!existsSync(digests)) return;
  for (const day of readdirSync(digests)) {
    const dir = join(digests, day);
    let sel = null;
    try { sel = JSON.parse(readFileSync(join(dir, 'selection.json'), 'utf8')); } catch { continue; }
    const reasons = new Map((sel.selected || []).map((s) => [s.id, s.reason]));
    for (const id of reasons.keys()) {
      const src = join(dir, 'reports', `${id}.md`);
      if (!existsSync(src)) continue;
      if (!existsSync(reportPath(id))) copyFileSync(src, reportPath(id));
      const tsrc = join(dir, 'transcripts', `${id}.txt`);
      if (existsSync(tsrc) && !existsSync(transcriptPath(id))) copyFileSync(tsrc, transcriptPath(id));
      if (state.videos[id]?.status === 'done') continue;
      const md = readFileSync(src, 'utf8');
      const g = (k) => (md.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.+)`)) || [])[1]?.trim() || '';
      state.videos[id] = {
        ...(state.videos[id] || {}), id, url: `https://www.youtube.com/watch?v=${id}`,
        title: g('Title').replace(/\\\$/g, '$'), channel: g('Channel').replace(/\s*\(.*\)$/, ''),
        duration: (g('Duration').match(/[\d:]+/) || [''])[0], publishedAt: Date.parse(`${day.slice(0, 10)}T12:00:00-05:00`) || Date.now(),
        firstSeenAt: Date.now(), status: 'done', decision: { by: 'import', select: true, reason: reasons.get(id) }, updatedAt: Date.now(),
      };
    }
  }
  save();
}

function recover() {
  state.migrations = state.migrations || {};
  if (!state.migrations.noChannelCapV1) {
    let n = 0;
    for (const v of Object.values(state.videos)) {
      if (v.status === 'skipped' && /daily cap|per[- ]channel|limit/i.test(v.decision?.reason || '')) {
        v.status = 'queued';
        v.queuedAt = Date.now();
        v.decision = { by: 'auto', select: true, reason: 'Substantive technical talk (per-channel cap removed)', at: Date.now() };
        n++;
      }
    }
    state.migrations.noChannelCapV1 = Date.now();
    if (n) console.log(`Migration noChannelCapV1: ${n} channel-capped video(s) queued`);
  }
  for (const v of Object.values(state.videos)) {
    if (v.status === 'extracting') v.status = 'queued';
    if (v.status === 'selecting') v.status = 'new';
    // 'summarizing' keeps polling (agent may still be running)
  }
  save();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toSec = (ts) => ts.split(':').reduce((a, p) => a * 60 + Number(p), 0);

function renderReport(v) {
  let md = readFileSync(reportPath(v.id), 'utf8');
  md = md.replace(/\\\$/g, '&#36;').replace(/\$([^$\n]+)\$/g, (_, m) => `<code>${esc(m)}</code>`);
  md = md.replace(/(?<![(<"])(https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)/g, (u) => {
    const trail = u.match(/[.,;:]+$/)?.[0] || '';
    return `<${u.slice(0, u.length - trail.length)}>${trail}`;
  });
  let html = marked.parse(md, { gfm: true, breaks: true });
  const links = v.links || {};
  html = html.replace(/<a href="([^"]+)"/g, (_, href) => {
    const s = links[href.replace(/&amp;/g, '&')];
    const bad = s === 404 || s === 410 || s === 0 || s === 'redirect';
    return `<a target="_blank" rel="noopener" href="${href}"${bad ? ` class="broken" title="Link check failed (${s})"` : ''}`;
  });
  html = html.replace(/<h4>\[(\d+:\d+(?::\d+)?) - (\d+:\d+(?::\d+)?)\]\s*(.*?)<\/h4>/g,
    (_, a, b, rest) => `<h4><a class="ts" target="_blank" rel="noopener" href="${esc(v.url)}&amp;t=${toSec(a)}s">${a} – ${b}</a> ${rest}</h4>`);
  return html;
}

function publicVideo(v) {
  const { id, url, title, channel, duration, durationSec, status, decision, error, publishedAt, conversationId, startedAt, finishedAt, links } = v;
  const broken = links ? Object.values(links).filter((s) => s === 404 || s === 410 || s === 0 || s === 'redirect').length : 0;
  return { id, url, title, channel, duration, durationSec, status, decision, error, publishedAt, conversationId, startedAt, finishedAt, brokenLinks: broken, day: nyDate(publishedAt || Date.now()) };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = new SidecarApp();
const BOOT_ID = randomUUID();
let pendingNavigation = null;
let navPollCount = 0;
let lastNavPollAt = null;
const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');
app.page('/', () => readLocal('index.html'));
app.page('/app.js', () => readLocal('app.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

app.api('/api/nav-poll', () => {
  navPollCount++;
  lastNavPollAt = Date.now();
  const nav = pendingNavigation && Date.now() - pendingNavigation.seq < 15000 ? pendingNavigation : null;
  pendingNavigation = null;
  return { bootId: BOOT_ID, pendingNavigation: nav, navPollCount, lastNavPollAt };
}, 'GET');

app.api('/api/state', () => {
  const cutoff = Date.now() - 4 * 24 * 3600e3;
  const videos = Object.values(state.videos)
    .filter((v) => v.status !== 'skipped' || (v.publishedAt || 0) > cutoff)
    .filter((v) => !(v.status === 'skipped' && /^Older than/.test(v.decision?.reason || '')))
    .map(publicVideo)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  return {
    bootId: BOOT_ID,
    videos, scraping, lastScrapeAt: state.lastScrapeAt, nextScrapeAt: state.nextScrapeAt,
    lastScrapeError: state.lastScrapeError, slotsUsedToday: slotsUsedToday(), maxAutoPerDay: CFG.maxAutoPerDay,
    log: (state.log || []).slice(0, 30),
  };
}, 'GET');

app.api('/api/report', (data) => {
  const v = state.videos[data.id];
  if (!v || !existsSync(reportPath(v.id))) return new Response('Not found', { status: 404, contentType: 'text/plain' });
  return new Response(renderReport(v), { contentType: 'text/html' });
}, 'GET');

const summarizeHandler = (data) => {
  const v = state.videos[data.id];
  if (!v) return { ok: false, error: 'unknown video' };
  if (['queued', 'extracting', 'waiting', 'summarizing'].includes(v.status)) return { ok: true, status: v.status };
  setStatus(v, 'queued', { queuedAt: Date.now(), error: null, decision: { ...(v.decision || {}), by: 'user', select: true, reason: v.decision?.reason ? `Requested manually (auto: ${v.decision.reason})` : 'Requested manually', at: Date.now() } });
  log(`Manual summarize: ${v.title}`);
  pump();
  return { ok: true, status: 'queued' };
};
app.api('/api/summarize', summarizeHandler, 'GET');
app.api('/api/summarize', summarizeHandler, 'POST');

const refreshHandler = () => {
  scrapeFeed('manual');
  return { ok: true };
};
app.api('/api/refresh', refreshHandler, 'GET');
app.api('/api/refresh', refreshHandler, 'POST');

const SUMMARIES_DIR = join(homedir(), 'workspace', 'summaries');
const SUMMARIES_URI = `file://${SUMMARIES_DIR}`;
const DIGEST_URI = `file://${ROOT}`;
mkdirSync(SUMMARIES_DIR, { recursive: true });

const DEFAULT_MODEL_ENUM = 'MODEL_PLACEHOLDER_M532'; // Gemini 4 Neon (High)

const MODEL_ENUM_MAP = {
  neon: 'MODEL_PLACEHOLDER_M532',            // Gemini 4 Neon (High)
  neon_high: 'MODEL_PLACEHOLDER_M532',       // Gemini 4 Neon (High)
  neon_xhigh: 'MODEL_PLACEHOLDER_M535',      // Gemini 4 Neon (XHigh)
  neon_medium: 'MODEL_PLACEHOLDER_M533',     // Gemini 4 Neon (Medium)
  neon_low: 'MODEL_PLACEHOLDER_M534',        // Gemini 4 Neon (Low)
  hydrogen: 'MODEL_PLACEHOLDER_M525',        // Gemini 4 Hydrogen (High)
  hydrogen_high: 'MODEL_PLACEHOLDER_M525',   // Gemini 4 Hydrogen (High)
  hydrogen_xhigh: 'MODEL_PLACEHOLDER_M528',  // Gemini 4 Hydrogen (XHigh)
  hydrogen_medium: 'MODEL_PLACEHOLDER_M526', // Gemini 4 Hydrogen (Medium)
  hydrogen_low: 'MODEL_PLACEHOLDER_M527',    // Gemini 4 Hydrogen (Low)
  flash: 'MODEL_PLACEHOLDER_M318',           // Gemini 3.8 Flash (High)
  flash_high: 'MODEL_PLACEHOLDER_M318',      // Gemini 3.8 Flash (High)
  flash_medium: 'MODEL_PLACEHOLDER_M319',    // Gemini 3.8 Flash (Medium)
  flash_lite: 'MODEL_PLACEHOLDER_M320',      // Gemini 3.8 Flash (Low)
  flash_low: 'MODEL_PLACEHOLDER_M320',       // Gemini 3.8 Flash (Low)
};

const MODEL_DISPLAY_MAP = {
  MODEL_PLACEHOLDER_M532: 'Gemini 4 Neon (High)',
  MODEL_PLACEHOLDER_M535: 'Gemini 4 Neon (XHigh)',
  MODEL_PLACEHOLDER_M533: 'Gemini 4 Neon (Medium)',
  MODEL_PLACEHOLDER_M534: 'Gemini 4 Neon (Low)',
  MODEL_PLACEHOLDER_M525: 'Gemini 4 Hydrogen (High)',
  MODEL_PLACEHOLDER_M528: 'Gemini 4 Hydrogen (XHigh)',
  MODEL_PLACEHOLDER_M526: 'Gemini 4 Hydrogen (Medium)',
  MODEL_PLACEHOLDER_M527: 'Gemini 4 Hydrogen (Low)',
  MODEL_PLACEHOLDER_M318: 'Gemini 3.8 Flash (High)',
  MODEL_PLACEHOLDER_M319: 'Gemini 3.8 Flash (Medium)',
  MODEL_PLACEHOLDER_M320: 'Gemini 3.8 Flash (Low)',
};

function resolvePlanModel(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return { modelKey: 'neon', planModel: DEFAULT_MODEL_ENUM };
  if (/^MODEL_[A-Z0-9_]+$/.test(key)) return { modelKey: key, planModel: key };
  if (Object.prototype.hasOwnProperty.call(MODEL_ENUM_MAP, key)) {
    return { modelKey: key, planModel: MODEL_ENUM_MAP[key] };
  }
  return { modelKey: 'neon', planModel: DEFAULT_MODEL_ENUM };
}

async function getAvailableModels() {
  try {
    const res = await lsRpc('GetUserStatus', {});
    const configs = res?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
    const seen = new Set();
    const models = [];
    for (const c of configs) {
      const id = c?.modelOrAlias?.model;
      const label = c?.label;
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      MODEL_DISPLAY_MAP[id] = label;
      models.push({ id, label });
    }
    if (models.length > 0) {
      return { ok: true, defaultModel: DEFAULT_MODEL_ENUM, models };
    }
  } catch {}
  return {
    ok: true,
    defaultModel: DEFAULT_MODEL_ENUM,
    models: Object.entries(MODEL_DISPLAY_MAP).map(([id, label]) => ({ id, label })),
  };
}
app.api('/api/models', getAvailableModels, 'GET');

async function lsRpc(method, body) {
  const addr = process.env.ANTIGRAVITY_LS_ADDRESS;
  const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN;
  if (!addr || !csrf) throw new Error('ANTIGRAVITY_LS_ADDRESS or ANTIGRAVITY_CSRF_TOKEN not set');
  const res = await fetch(`http://${addr}/exa.language_server_pb.LanguageServerService/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-codeium-csrf-token': csrf,
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(json?.message || `LS RPC ${method} HTTP ${res.status}`);
  }
  return json;
}

let cachedSummariesProjectId = null;
async function ensureSummariesProject() {
  if (cachedSummariesProjectId) return cachedSummariesProjectId;
  const list = await lsRpc('ListProjects', {});
  const ids = list.projectIds || [];
  if (ids.length > 0) {
    const read = await lsRpc('ReadProjects', { ids });
    const existing = (read.projects || []).find((p) =>
      p.name === 'summaries' ||
      (p.projectResources?.resources || []).some((r) => r.folderUri === SUMMARIES_URI)
    );
    if (existing?.id) {
      const resources = existing.projectResources?.resources || [];
      const hasDigest = resources.some((r) => r.folderUri === DIGEST_URI);
      if (!hasDigest) {
        await lsRpc('UpdateProject', {
          project: {
            ...existing,
            projectResources: {
              resources: [...resources, { folderUri: DIGEST_URI }],
            },
          },
        }).catch(() => {});
      }
      cachedSummariesProjectId = existing.id;
      return cachedSummariesProjectId;
    }
  }
  const newId = randomUUID();
  await lsRpc('CreateProject', {
    project: {
      id: newId,
      name: 'summaries',
      projectResources: {
        resources: [{ folderUri: SUMMARIES_URI }, { folderUri: DIGEST_URI }],
      },
      isWorkspaceOnly: false,
      settings: {
        fileAccessPolicy: 'AGENT_SETTING_POLICY_ALLOW',
        internetPolicy: 'AGENT_SETTING_POLICY_ALLOW',
        autoExecutionPolicy: 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER',
        artifactReviewMode: 'ARTIFACT_REVIEW_MODE_TURBO',
      },
    },
  });
  cachedSummariesProjectId = newId;
  return cachedSummariesProjectId;
}

function extractYouTubeId(text) {
  if (!text) return null;
  const m = String(text).match(/(?:youtube\.com\/watch\?[^"\s<>]*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return m ? m[1] : null;
}

function extractSourceUrl(text) {
  if (!text) return null;
  const m = String(text).match(/(?:Source|URL):\s*(https?:\/\/[^\s<>"]+)/i);
  return m ? m[1].replace(/[.,;:]+$/, '') : null;
}

function normalizeUrlKey(rawUrl) {
  if (!rawUrl) return null;
  const yt = extractYouTubeId(rawUrl);
  if (yt) return `yt:${yt}`;
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    return `url:${u.toString()}`;
  } catch {
    return `url:${String(rawUrl).trim()}`;
  }
}

const normTitle = (t) => String(t || '').toLowerCase().replace(/^(?:yt digest|summary):\s*/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function getActiveTrajectories() {
  try {
    const res = await lsRpc('GetAllCascadeTrajectories', {});
    return res.trajectorySummaries || {};
  } catch {
    return {};
  }
}

async function findExistingConversation({ conversationId, videoId, url, title } = {}) {
  state.sessionsByKey = state.sessionsByKey || {};
  const summaries = await getActiveTrajectories();
  const isValid = (id) => id && summaries[id] && !summaries[id].annotations?.archived;

  if (isValid(conversationId)) return conversationId;
  if (videoId && isValid(state.videos[videoId]?.conversationId)) return state.videos[videoId].conversationId;
  if (videoId && isValid(state.sessionsByKey[`yt:${videoId}`]?.conversationId)) return state.sessionsByKey[`yt:${videoId}`].conversationId;

  const urlKey = normalizeUrlKey(url);
  if (urlKey && isValid(state.sessionsByKey[urlKey]?.conversationId)) return state.sessionsByKey[urlKey].conversationId;

  const targetNorm = normTitle(title);
  if (targetNorm && targetNorm.length >= 6) {
    let bestId = null;
    let bestTime = 0;
    for (const [cid, info] of Object.entries(summaries)) {
      if (info.annotations?.archived) continue;
      const sNorm = normTitle(info.summary || info.annotations?.title || '');
      if (!sNorm) continue;
      if (sNorm === targetNorm || (targetNorm.length >= 15 && (sNorm.startsWith(targetNorm.slice(0, 35)) || targetNorm.startsWith(sNorm.slice(0, 35))))) {
        const t = Date.parse(info.lastModifiedTime || info.createdTime || '') || 0;
        if (t >= bestTime) {
          bestTime = t;
          bestId = cid;
        }
      }
    }
    if (bestId) return bestId;
  }
  return null;
}

async function backfillConversations() {
  const summaries = await getActiveTrajectories();
  const entries = Object.entries(summaries).filter(([, info]) => !info.annotations?.archived);
  if (!entries.length) return;
  let linked = 0;
  state.sessionsByKey = state.sessionsByKey || {};
  for (const v of Object.values(state.videos)) {
    if (v.conversationId && summaries[v.conversationId] && !summaries[v.conversationId].annotations?.archived) {
      state.sessionsByKey[`yt:${v.id}`] = { conversationId: v.conversationId, videoId: v.id, title: v.title, createdAt: v.updatedAt || Date.now() };
      continue;
    }
    const vNorm = normTitle(v.title);
    if (!vNorm || vNorm.length < 6) continue;
    for (const [cid, info] of entries) {
      const sNorm = normTitle(info.summary || info.annotations?.title || '');
      if (!sNorm) continue;
      if (sNorm === vNorm || (vNorm.length >= 15 && (sNorm.startsWith(vNorm.slice(0, 35)) || vNorm.startsWith(sNorm.slice(0, 35))))) {
        v.conversationId = cid;
        state.sessionsByKey[`yt:${v.id}`] = { conversationId: cid, videoId: v.id, title: v.title, createdAt: Date.now() };
        linked++;
        break;
      }
    }
  }
  if (linked > 0) {
    log(`Linked ${linked} existing AGY conversation(s) to digest library videos`);
    save();
  }
}

async function startDirectCascade({ title, prompt, prefix = 'Summary', modelKey = 'neon', focusApp = false }) {
  const cleanTitle = String(title || 'Summary').trim().replace(/\s+/g, ' ').slice(0, 80);
  const fullTitle = new RegExp(`^${prefix}:\\s*`, 'i').test(cleanTitle) ? cleanTitle : `${prefix}: ${cleanTitle}`;
  const { planModel } = resolvePlanModel(modelKey);
  const projectId = await ensureSummariesProject();
  const cascadeId = randomUUID();

  await lsRpc('StartCascade', {
    cascadeId,
    source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
    requestedModel: planModel,
    projectEnvConfig: {
      projectId,
      defaultProjectEnvironment: {},
    },
  });

  await lsRpc('UpdateConversationAnnotations', {
    cascadeId,
    annotations: {
      title: fullTitle,
      lastUserViewTime: new Date().toISOString(),
    },
    mergeAnnotations: true,
  });

  await lsRpc('SendUserCascadeMessage', {
    cascadeId,
    items: [{ text: prompt }],
    cascadeConfig: {
      plannerConfig: {
        supportsLatexRendering: true,
        planModel,
        requestedModel: { model: planModel },
        toolConfig: {
          runCommand: {
            autoCommandConfig: {
              autoExecutionPolicy: 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER',
            },
          },
          notifyUser: {
            artifactReviewMode: 'ARTIFACT_REVIEW_MODE_TURBO',
          },
        },
      },
      executorConfig: {
        useCoreDirect: true,
      },
    },
  });

  if (focusApp) {
    pendingNavigation = { conversationId: cascadeId, seq: Date.now() };
    run('open', [`antigravity://c/${cascadeId}`], { timeoutMs: 5000 }).catch(() => {});
  }

  return {
    ok: true,
    conversationId: cascadeId,
    projectId,
    workspace: 'summaries',
    model: modelKey,
    modelEnum: planModel,
    modelDisplayName: MODEL_DISPLAY_MAP[planModel] || 'Gemini 4 Neon (High)',
    title: cleanTitle,
    conversationLink: `conversation://${cascadeId}`,
    openAppUrl: `http://127.0.0.1:8787/api/open-agy?id=${encodeURIComponent(cascadeId)}`,
  };
}

const openAgyHandler = async (data) => {
  const id = String(data?.id || '').trim();
  if (id) {
    pendingNavigation = { conversationId: id, seq: Date.now() };
    lsRpc('UpdateConversationAnnotations', {
      cascadeId: id,
      annotations: { lastUserViewTime: new Date().toISOString() },
      mergeAnnotations: true,
    }).catch(() => {});
  }
  const deepUrl = id ? `antigravity://c/${id}` : 'antigravity://';
  await run('open', [deepUrl], { timeoutMs: 5000 });
  return { ok: true, id, deepUrl, pendingNavigation };
};
app.api('/api/open-agy', openAgyHandler, 'GET');
app.api('/api/open-agy', openAgyHandler, 'POST');

const openVideoAgyHandler = async (data) => {
  const id = String(data?.id || '').trim();
  const v = state.videos[id];
  if (!v) return { ok: false, error: 'Unknown video' };

  const existingId = await findExistingConversation({
    conversationId: v.conversationId,
    videoId: v.id,
    url: v.url,
    title: v.title,
  });

  if (existingId) {
    v.conversationId = existingId;
    state.sessionsByKey = state.sessionsByKey || {};
    state.sessionsByKey[`yt:${v.id}`] = { conversationId: existingId, videoId: v.id, title: v.title, createdAt: Date.now() };
    save();
    await openAgyHandler({ id: existingId });
    return {
      ok: true,
      reused: true,
      conversationId: existingId,
      openAppUrl: `http://127.0.0.1:8787/api/open-agy?id=${encodeURIComponent(existingId)}`,
    };
  }

  // If the report already exists on disk (e.g. imported earlier), open a lightweight session seeded with the report so we don't re-summarize or waste quota!
  if (existsSync(reportPath(v.id))) {
    const seedPrompt = `The YouTube video "${v.title}" (${v.channel || 'YouTube'} — ${v.url}) has already been summarized in the YouTube Digest library.\n\nRead the existing summary report at ${reportPath(v.id)} (and if needed for follow-up questions, the transcript is at ${transcriptPath(v.id)}).\n\nPresent a concise overview confirming the report is loaded, and stand by to answer any questions about the video.`;
    const started = await startDirectCascade({
      title: v.title,
      prompt: seedPrompt,
      prefix: 'YT Digest',
      modelKey: CFG.model,
      focusApp: true,
    });
    if (started.ok && started.conversationId) {
      v.conversationId = started.conversationId;
      state.sessionsByKey = state.sessionsByKey || {};
      state.sessionsByKey[`yt:${v.id}`] = { conversationId: started.conversationId, videoId: v.id, title: v.title, createdAt: Date.now() };
      save();
    }
    return { ...started, reused: false, seededFromReport: true };
  }

  // Otherwise queue/start summarization for this video
  summarizeHandler({ id: v.id });
  return { ok: true, status: v.status, queued: true };
};
app.api('/api/open-video-agy', openVideoAgyHandler, 'GET');
app.api('/api/open-video-agy', openVideoAgyHandler, 'POST');

const CONCISE_WALKTHROUGH_TEMPLATE = `### Timestamped Walkthrough
Create a **concise, high-signal walkthrough** of the video's major themes so the reader gets the full substance in **~10–15% of the time it would take to watch** (never write a blow-by-blow rewrite that takes nearly as long to read as the segment itself).

**Sectioning & Brevity Rules:**
- **Major Thematic Chapters Only:** Group the video into broad, meaningful chapters spanning roughly **3–8 minutes each** (aim for **4–6 sections** for a 10–25 min video, **6–9 sections** for a 25–60 min video, and **8–12 sections** for a 60+ min podcast). NEVER slice the video into 1–2 minute micro-segments.
- **Continuous Coverage (Excluding Ads):** Keep timestamps contiguous across the actual video content (\`[Start Time - End Time]\`), merging adjacent sub-points into a single thematic chapter and silently omitting any ads, paid sponsorships, host-read promos, affiliate/promo pitches, and self-promos without mentioning them anywhere in the summary.
- **Strict Length Cap per Section:** Write **2–4 tight bullet points per section** (1–2 sentences per bullet). Synthesize the core argument, mechanism, or concrete example—omit throat-clearing, anecdotes, and repetition.
- **Selective Quotes:** Include **at most 1 short verbatim quote** per section, and only when the exact phrasing is memorable or load-bearing.
- **Strict Heading Format:** Format every section using a Level 4 Markdown heading (\`####\`):

**FORMAT EXACTLY LIKE THIS FOR EVERY SECTION:**

#### [Start Time - End Time] Specific Topic/Chapter Title
- Distill the core claim, technical mechanism, or takeaway in 2–4 concise bullets.
- Define any critical new jargon inline in one short clause, and include at most one short verbatim quote if genuinely impactful.

#### [Next Start Time - Next End Time] Next Topic/Chapter Title
- [2–4 concise bullets for the next chapter...]

*(Continue this pattern for the entire video)*`;

const agySessionHandler = async (data) => {
  const rawPrompt = String(data?.prompt || '').trim();
  const sourceUrl = data?.url || data?.videoUrl || extractSourceUrl(rawPrompt) || '';
  // Only treat as a YouTube video when videoId is explicitly provided or the page URL itself is YouTube
  // (never scan arbitrary comment/article bodies for embedded YouTube links).
  const videoId = data?.videoId || extractYouTubeId(sourceUrl) || null;
  if (!rawPrompt && !videoId) return { ok: false, error: 'Missing prompt or videoId' };

  let prompt = rawPrompt.replace(
    /### Timestamped Walkthrough[\s\S]*?\*\(Continue this (?:strict )?pattern for the entire video\)\*/i,
    CONCISE_WALKTHROUGH_TEMPLATE
  );
  let rawTitle = String(data?.title || state.videos[videoId]?.title || 'Summary').trim().replace(/\s+/g, ' ');
  let title = rawTitle.length > 80 ? rawTitle.slice(0, 80) : rawTitle;
  const requestedModel = (!data?.model || data?.model === 'flash' || data?.model === 'hydrogen') ? 'neon' : data.model;
  const { modelKey, planModel } = resolvePlanModel(requestedModel);
  const urlKey = videoId ? `yt:${videoId}` : normalizeUrlKey(sourceUrl) || `title:${normTitle(title)}`;

  // Deduplicate unless force=true
  if (!data?.force) {
    const existingId = await findExistingConversation({
      videoId,
      url: sourceUrl,
      title: title !== 'Summary' ? title : '',
    });
    if (existingId) {
      log(`Reusing existing AGY session ${existingId} for: ${title}`);
      if (videoId && state.videos[videoId]) {
        state.videos[videoId].conversationId = existingId;
      }
      state.sessionsByKey = state.sessionsByKey || {};
      state.sessionsByKey[urlKey] = { conversationId: existingId, videoId, url: sourceUrl, title, createdAt: Date.now() };
      save();
      if (data?.focusApp) {
        openAgyHandler({ id: existingId }).catch(() => {});
      }
      return {
        ok: true,
        reused: true,
        conversationId: existingId,
        workspace: 'summaries',
        model: modelKey,
        modelEnum: planModel,
        modelDisplayName: MODEL_DISPLAY_MAP[planModel] || 'Gemini 4 Neon (High)',
        title,
        conversationLink: `conversation://${existingId}`,
        openAppUrl: `http://127.0.0.1:8787/api/open-agy?id=${encodeURIComponent(existingId)}`,
      };
    }

    // Also check if the YouTube video already has a completed report on disk from YouTube Digest
    if (videoId && existsSync(reportPath(videoId))) {
      log(`Video ${videoId} already has report on disk; seeding AGY session from ${reportPath(videoId)}`);
      const seedPrompt = `The YouTube video "${title}" (https://www.youtube.com/watch?v=${videoId}) has already been summarized in the YouTube Digest library.\n\nRead the existing summary report at ${reportPath(videoId)} and output it directly so we don't waste quota re-summarizing. Stand by for any follow-up questions.`;
      const seeded = await startDirectCascade({
        title,
        prompt: seedPrompt,
        prefix: 'Summary',
        modelKey,
        focusApp: !!data?.focusApp,
      });
      if (seeded.ok && seeded.conversationId) {
        if (state.videos[videoId]) state.videos[videoId].conversationId = seeded.conversationId;
        state.sessionsByKey = state.sessionsByKey || {};
        state.sessionsByKey[`yt:${videoId}`] = { conversationId: seeded.conversationId, videoId, url: sourceUrl, title, createdAt: Date.now() };
        save();
      }
      return { ...seeded, reused: true, seededFromReport: true };
    }
  }

  // If this is a YouTube video without an embedded <transcript> (e.g. clicked directly from a YouTube card without opening a tab!),
  // fetch the transcript + metadata in ~1s in the background via youtube-transcript-api.
  if (videoId && !/<transcript>[\s\S]{100,}<\/transcript>/i.test(prompt)) {
    log(`Fast background transcript fetch for YouTube video ${videoId}...`);
    const ytData = await fetchYouTubeFast(videoId);
    if (ytData?.ok && ytData.transcript) {
      if (ytData.title && (!data?.title || data.title === 'Summary')) {
        rawTitle = ytData.title.trim().replace(/\s+/g, ' ');
        title = rawTitle.length > 80 ? rawTitle.slice(0, 80) : rawTitle;
      }
      const tmpl = getYouTubePromptTemplate();
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const descUrls = [...new Set((ytData.description?.match(/https?:\/\/[^\s<>")\]]+/g) || []))];
      const footnotesBlock = descUrls.length
        ? `\nHere are the URLs found in the description:\n${descUrls.map((u, i) => `[${i + 1}] ${u}`).join('\n')}\n`
        : '';
      prompt = `${tmpl}
### Video Metadata
**Title:** ${ytData.title || title}
**Channel:** ${ytData.channel || 'N/A'}
**URL:** ${canonicalUrl}
**Info:** ${ytData.duration || 'N/A'} • ${ytData.views || 'N/A'} • ${ytData.publishDate || 'N/A'}
**Extraction Date:** ${new Date().toLocaleString()}
${footnotesBlock}
Here is the description:
<description>
${ytData.description || 'N/A'}
</description>

Here is the transcript:
<transcript>
${ytData.transcript}
</transcript>`;
    } else if (!prompt) {
      const reason = String(ytData?.error || 'captions may be disabled').replace(/\s+/g, ' ').slice(0, 140);
      log(`Fast background transcript fetch failed for ${videoId}: ${reason}`);
      return { ok: false, error: `Could not fetch transcript for ${videoId}: ${reason}` };
    }
  }

  log(`Extension AGY session (${modelKey} -> ${planModel}): ${title}`);
  try {
    const started = await startDirectCascade({
      title,
      prompt,
      prefix: 'Summary',
      modelKey,
      focusApp: !!data?.focusApp,
    });
    if (started.ok && started.conversationId) {
      state.sessionsByKey = state.sessionsByKey || {};
      state.sessionsByKey[urlKey] = { conversationId: started.conversationId, videoId, url: sourceUrl, title, createdAt: Date.now() };
      if (videoId && state.videos[videoId]) {
        state.videos[videoId].conversationId = started.conversationId;
      }
      save();
    }
    return { ...started, reused: false };
  } catch (err) {
    const errMsg = String(err?.message || err).slice(0, 300);
    log(`Direct StartCascade error: ${errMsg}`);
    return { ok: false, error: errMsg };
  }
};
app.api('/api/agy-session', agySessionHandler, 'GET');
app.api('/api/agy-session', agySessionHandler, 'POST');

// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
recover();
importDigests();
backfillConversations().catch(() => {});
app.run().then((srv) => {
  const fixedPort = Number(process.env.YT_DIGEST_FIXED_PORT || 8787);
  if (fixedPort && srv && typeof srv.listeners === 'function') {
    import('node:http').then(({ createServer }) => {
      const mirror = createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sidecar-Token');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.url?.startsWith('/api/models')) {
          getAvailableModels().then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }).catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          });
          return;
        }
        if (req.url?.startsWith('/api/nav-poll')) {
          const isInspect = req.url.includes('inspect=1');
          const nav = pendingNavigation && Date.now() - pendingNavigation.seq < 15000 ? pendingNavigation : null;
          if (!isInspect) {
            navPollCount++;
            lastNavPollAt = Date.now();
            pendingNavigation = null;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ bootId: BOOT_ID, pendingNavigation: nav, navPollCount, lastNavPollAt }));
          return;
        }
        if (req.url?.startsWith('/api/open-agy')) {
          const u = new URL(req.url, 'http://127.0.0.1:8787');
          const id = u.searchParams.get('id') || '';
          openAgyHandler({ id }).then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }).catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          });
          return;
        }
        if (req.url?.startsWith('/api/open-video-agy')) {
          const u = new URL(req.url, 'http://127.0.0.1:8787');
          const id = u.searchParams.get('id') || '';
          openVideoAgyHandler({ id }).then((result) => {
            res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }).catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          });
          return;
        }
        if (req.method === 'POST' && req.url?.startsWith('/api/agy-session')) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const result = await agySessionHandler(payload);
              res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
          return;
        }
        srv.emit('request', req, res);
      });
      mirror.on('error', () => {});
      mirror.listen(fixedPort, '127.0.0.1', () => log(`Browser mirror listening on http://127.0.0.1:${fixedPort}`));
    });
  }
});
log(`YouTube Digest sidecar started (data: ${DATA_DIR})`);
if (process.env.YT_DIGEST_NO_SCHEDULER !== '0') {
  log('Background feed scheduler paused; serving local AGY bridge & existing library UI');
} else {
  pump();
  if (Object.values(state.videos).some((v) => v.status === 'new')) selectNew();
  // Feed check now if overdue, then hourly
  const firstIn = Math.max(5000, (state.nextScrapeAt || 0) - Date.now());
  setTimeout(function tick() {
    scrapeFeed().finally(() => setTimeout(tick, CFG.scrapeEveryMs));
  }, Math.min(firstIn, CFG.scrapeEveryMs));
}
