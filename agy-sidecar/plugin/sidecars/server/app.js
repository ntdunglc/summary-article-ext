// Frontend for the YouTube Digest panel.
const $ = (s) => document.querySelector(s);
const api = (url, opts = {}) => (window.sidecar?.fetch ? window.sidecar.fetch(url, opts) : fetch(url, opts));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let data = { videos: [] };
let filter = 'done';
let openId = null;
let seenBootId = null;
let lastNavSeq = Date.now() - 2500;

function navigateAgyConversation(conversationId) {
  if (!conversationId) return;
  if (window.sidecar?.ui?.toggleConversation) {
    window.sidecar.ui.toggleConversation(conversationId);
  } else if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'toggle-conversation',
      payload: { conversationId },
    }, '*');
  }
}

function handleServerSync(payload) {
  if (!payload) return;
  if (payload.bootId) {
    if (seenBootId && seenBootId !== payload.bootId) {
      window.location.reload();
      return;
    }
    seenBootId = payload.bootId;
  }
  const nav = payload.pendingNavigation;
  if (nav && nav.conversationId && nav.seq > lastNavSeq) {
    lastNavSeq = nav.seq;
    navigateAgyConversation(nav.conversationId);
  }
}

async function pollNav() {
  try {
    const r = await api('/api/nav-poll');
    if (r.ok) {
      handleServerSync(await r.json());
    }
  } catch (_) {}
}

const STATUS_LABEL = {
  queued: 'Queued', extracting: 'Getting transcript…', waiting: 'Waiting for agent',
  summarizing: 'Summarizing…', failed: 'Failed', selecting: 'Being evaluated…', new: 'New',
};
const inFilter = (v) =>
  filter === 'done' ? v.status === 'done'
    : filter === 'skipped' ? v.status === 'skipped'
      : !['done', 'skipped'].includes(v.status);

function ago(ms) {
  if (!ms) return '—';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
function until(ms) {
  if (!ms) return '';
  const m = Math.round((ms - Date.now()) / 60000);
  return m <= 0 ? 'soon' : `in ${m}m`;
}

async function load() {
  try {
    const r = await api('/api/state');
    data = await r.json();
    handleServerSync(data);
    render();
  } catch (e) {
    $('#status').textContent = 'Server unreachable';
  }
}

function render() {
  const vids = data.videos;
  $('#c-done').textContent = vids.filter((v) => v.status === 'done').length;
  $('#c-queue').textContent = vids.filter((v) => !['done', 'skipped'].includes(v.status)).length || '';
  $('#c-skipped').textContent = vids.filter((v) => v.status === 'skipped').length;
  $('#status').textContent = data.scraping
    ? 'Checking feed…'
    : `${data.lastScrapeError ? '⚠ ' + data.lastScrapeError + ' · ' : ''}checked ${ago(data.lastScrapeAt)} · next ${until(data.nextScrapeAt)} · ${data.slotsUsedToday} auto-picked today`;
  $('#refresh').disabled = !!data.scraping;
  $('#log').textContent = (data.log || []).join('\n');

  const list = vids.filter(inFilter);
  const byDay = new Map();
  for (const v of list) {
    if (!byDay.has(v.day)) byDay.set(v.day, []);
    byDay.get(v.day).push(v);
  }
  const html = [...byDay.entries()].map(([day, vs]) => `
    <section class="day"><h2>${esc(day)}</h2>
      <ul>${vs.map(item).join('')}</ul>
    </section>`).join('');
  $('#items').innerHTML = html || `<p class="muted empty">${filter === 'queue' ? 'Nothing in progress.' : 'Nothing here yet.'}</p>`;
}

function item(v) {
  const thumb = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const meta = [v.channel, v.duration].filter(Boolean).map(esc).join(' · ');
  const reason = v.decision?.reason ? `<p class="why">${esc(v.decision.reason)}</p>` : '';
  const err = v.status === 'failed' && v.error ? `<p class="err">${esc(v.error)}</p>` : '';
  const badge = v.status !== 'done' && v.status !== 'skipped' ? `<span class="badge s-${v.status}">${STATUS_LABEL[v.status] || v.status}</span>` : '';
  const broken = v.brokenLinks ? `<span class="badge s-failed" title="Some cited links failed the check">${v.brokenLinks} broken link${v.brokenLinks > 1 ? 's' : ''}</span>` : '';
  let action = '';
  if (v.status === 'skipped') action = `<button type="button" class="btn btn-sm" data-act="summarize" data-id="${v.id}" aria-label="Summarize: ${esc(v.title)}">Summarize</button>`;
  else if (v.status === 'failed') action = `<button type="button" class="btn btn-sm" data-act="summarize" data-id="${v.id}" aria-label="Retry: ${esc(v.title)}">Retry</button>`;
  const agyBtn = (v.status === 'done' || v.status === 'summarizing' || v.conversationId)
    ? `<button type="button" class="btn-secondary btn-sm" data-act="open-agy" data-id="${v.id}" aria-label="Open in AGY ↗: ${esc(v.title)}">Open in AGY ↗</button>`
    : '';
  const open = v.status === 'done';
  return `<li class="card${open && v.id === openId ? ' active' : ''}">
    ${open ? `<button type="button" class="card-open" data-act="open" data-id="${v.id}" aria-label="Read summary: ${esc(v.title)}">` : `<a class="card-open" href="${esc(v.url)}" target="_blank" rel="noopener">`}
      <img src="${thumb}" alt="" loading="lazy" width="120" height="68">
      <span class="card-text">
        <span class="title">${esc(v.title)}</span>
        <span class="meta">${meta}</span>
      </span>
    ${open ? '</button>' : '</a>'}
    <div class="card-foot">${badge}${broken}${reason}${err}${action}${agyBtn}</div>
  </li>`;
}

async function openReport(id) {
  const v = data.videos.find((x) => x.id === id);
  if (!v) return;
  openId = id;
  document.body.classList.add('reading');
  $('#report-pane').hidden = false;
  $('#empty-pane').hidden = true;
  $('#report-hero').innerHTML = `
    <a class="hero-thumb" href="${esc(v.url)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" width="240" height="135"></a>
    <div><h1>${esc(v.title)}</h1><p class="muted">${esc(v.channel)} · ${esc(v.duration)}</p>
    <div class="hero-actions">
      <a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">Watch on YouTube ↗</a>
      <button type="button" class="btn-secondary" data-act="open-agy" data-id="${v.id}" aria-label="Open in AGY ↗: ${esc(v.title)}">Open in AGY ↗</button>
    </div></div>`;
  $('#report').innerHTML = '<p class="muted">Loading…</p>';
  const r = await api(`/api/report?id=${encodeURIComponent(id)}`);
  $('#report').innerHTML = r.ok ? await r.text() : '<p class="err">Report not found.</p>';
  $('#report-pane').scrollTop = 0;
  render();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  if (act === 'open') openReport(id);
  if (act === 'summarize') {
    el.disabled = true;
    el.textContent = 'Queued';
    const r = await api(`/api/summarize?id=${encodeURIComponent(id)}`);
    if (!r.ok) { el.disabled = false; el.textContent = 'Error'; return; }
    load();
  }
  if (act === 'open-agy') {
    const orig = el.textContent;
    el.disabled = true;
    el.textContent = 'Opening AGY…';
    try {
      const r = await api(`/api/open-video-agy?id=${encodeURIComponent(id)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Failed');
      if (j.conversationId) {
        navigateAgyConversation(j.conversationId);
      }
      el.textContent = j.queued ? 'Queued in AGY ✓' : 'Opened in AGY ✓';
      setTimeout(() => {
        el.disabled = false;
        el.textContent = orig;
        load();
      }, 1800);
    } catch {
      el.textContent = 'Error';
      setTimeout(() => {
        el.disabled = false;
        el.textContent = orig;
      }, 2000);
    }
  }
});

$('#back').addEventListener('click', () => {
  document.body.classList.remove('reading');
  $('#report-pane').hidden = true;
  $('#empty-pane').hidden = false;
  openId = null;
  render();
});

$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true;
  await api('/api/refresh');
  setTimeout(load, 500);
});

// Tabs (ARIA tabs pattern with arrow-key navigation)
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(t) {
  for (const x of tabs) {
    const on = x === t;
    x.setAttribute('aria-selected', on);
    x.tabIndex = on ? 0 : -1;
  }
  $('#items').setAttribute('aria-labelledby', t.id);
  filter = t.dataset.filter;
  render();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = tabs[(n + tabs.length) % tabs.length];
    selectTab(next); next.focus();
  });
});

load();
setInterval(load, 5000);
if (window.parent !== window) {
  pollNav();
  setInterval(pollNav, 500);
}
