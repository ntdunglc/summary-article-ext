const SERVICE_URLS = {
  claude: 'https://claude.ai/new',
  deepseek: 'https://chat.deepseek.com/',
  chatgpt: 'https://chatgpt.com/',
  aistudio: 'https://aistudio.google.com/prompts/new_chat',
  gemini: 'https://gemini.google.com/app'
};

const EXTRACTORS = {
  youtube: 'sites/youtube.js',
  article: 'sites/article.js',
  hackernews: 'sites/hackernews.js',
  amazon: 'sites/amazon.js',
  leetcode: 'sites/leetcode.js',
  zillow: 'sites/zillow.js',
  chesscom: 'sites/chesscom.js'
};

const HANDLERS = {
  claude: 'claudeBot',
  deepseek: 'deepseekBot',
  chatgpt: 'chatgptBot',
  gemini: 'geminiBot',
  aistudio: 'aistudioBot'
};

const AGY_BRIDGE_URL = 'http://127.0.0.1:8787/api/agy-session';

const DEFAULT_AGY_MODEL = 'MODEL_PLACEHOLDER_M532'; // Gemini 4 Neon (High)

async function ensureAgyDefaultMigrated() {
  const res = await chrome.storage.sync.get({
    service: 'antigravity',
    agyMigratedV1: false,
    agyHydrogenMigratedV1: false,
    agyNeonMigratedV1: false,
    agyModel: DEFAULT_AGY_MODEL
  });
  if (!res.agyMigratedV1 || !res.agyNeonMigratedV1) {
    await chrome.storage.sync.set({
      service: 'antigravity',
      agyModel: DEFAULT_AGY_MODEL,
      agyMigratedV1: true,
      agyHydrogenMigratedV1: true,
      agyNeonMigratedV1: true
    });
    return 'antigravity';
  }
  return (res.service || 'antigravity').toLowerCase();
}
async function reinjectYouTubeContentScripts() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['sites/youtube.js']
        }).catch(() => {});
      }
    }
  } catch (_) {}
}

reinjectYouTubeContentScripts();

chrome.runtime.onInstalled.addListener((details) => {
  reinjectYouTubeContentScripts();
  chrome.storage.sync.get({
    service: 'antigravity',
    agyMigratedV1: false,
    agyHydrogenMigratedV1: false,
    agyNeonMigratedV1: false,
    agyModel: DEFAULT_AGY_MODEL
  }, (res) => {
    if (!res.agyMigratedV1 || !res.agyNeonMigratedV1) {
      chrome.storage.sync.set({
        service: 'antigravity',
        agyModel: DEFAULT_AGY_MODEL,
        agyMigratedV1: true,
        agyHydrogenMigratedV1: true,
        agyNeonMigratedV1: true
      });
    }
  });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'send_to_agy',
      title: 'Send Prompt to New AGY Session',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'copy_prompt',
      title: 'Copy Prompt',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'copy_content',
      title: 'Copy Content',
      contexts: ['action']
    });
  });
});

// Helper executed in tab context to show a status toast
function showPageToast(message, isSuccess = true, isWarning = false, conversationId = null) {
  const TOAST_ID = '__ai_summarizer_toast__';
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;

  const bgColor = !isSuccess
    ? 'rgba(127, 29, 29, 0.95)'
    : isWarning
      ? 'rgba(45, 30, 10, 0.95)'
      : 'rgba(24, 24, 27, 0.95)';

  const borderColor = !isSuccess
    ? '1px solid rgba(239, 68, 68, 0.3)'
    : isWarning
      ? '1px solid rgba(245, 158, 11, 0.45)'
      : '1px solid rgba(255, 255, 255, 0.15)';

  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 18px',
    backgroundColor: bgColor,
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '1.4',
    borderRadius: '8px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
    border: borderColor,
    backdropFilter: 'blur(10px)',
    webkitBackdropFilter: 'blur(10px)',
    opacity: '0',
    transform: 'translateY(-10px)',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    pointerEvents: conversationId ? 'auto' : 'none',
    userSelect: 'none'
  });

  const iconSvg = !isSuccess
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : isWarning
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

  const actionHtml = conversationId
    ? `<a href="antigravity://c/${conversationId}" data-agy-open="${conversationId}" style="margin-left:6px;padding:4px 10px;border-radius:6px;background:rgba(139,92,246,0.25);border:1px solid rgba(167,139,250,0.45);color:#ddd6fe;text-decoration:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Open AGY ↗</a>`
    : '';

  toast.innerHTML = `${iconSvg}<span>${message}</span>${actionHtml}`;
  if (conversationId) {
    const btn = toast.querySelector('[data-agy-open]');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.textContent = 'Opening…';
        try {
          chrome.runtime.sendMessage({ type: 'openAgySession', conversationId }, (res) => {
            if (chrome.runtime.lastError || !res?.ok) {
              window.location.href = `antigravity://c/${conversationId}`;
            } else {
              btn.textContent = 'Opened ✓';
            }
          });
        } catch (_) {
          window.location.href = `antigravity://c/${conversationId}`;
        }
      });
    }
  }
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, conversationId ? 5500 : 3000);
}

async function sendPromptToAgySession(message, senderTabId, closeTabAfter = false) {
  await ensureAgyDefaultMigrated();
  const { agyModel = DEFAULT_AGY_MODEL } = await chrome.storage.sync.get({ agyModel: DEFAULT_AGY_MODEL });
  const title =
    message.videoTitle ||
    message.articleTitle ||
    (senderTabId && (await chrome.tabs.get(senderTabId).catch(() => null))?.title?.replace(/\s*-\s*YouTube$/i, '')) ||
    'Summary';

  let senderTabUrl = message.videoUrl || message.url || '';
  if (!senderTabUrl && senderTabId) {
    try {
      const tab = await chrome.tabs.get(senderTabId);
      senderTabUrl = tab?.url || '';
    } catch (_) {}
  }

  try {
    const res = await fetch(AGY_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: message.text || '',
        videoId: message.videoId || '',
        title: title,
        url: senderTabUrl,
        model: agyModel
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    console.log(`%c[Service Worker] ${data.reused ? 'Reused' : 'Started'} AGY session (${data.modelDisplayName || data.model} in ${data.workspace || 'summaries'}): ${data.conversationId}`, 'color: #10b981; font-weight: bold;');

    if (closeTabAfter && senderTabId) {
      await chrome.tabs.remove(senderTabId).catch(() => {});
      return true;
    }

    if (senderTabId) {
      const isWarning = !!message.hasWarning;
      const prefix = data.reused ? 'Already in AGY' : 'Sent to AGY';
      const displayName = data.modelDisplayName || 'Gemini 4 Neon (High)';
      const shortModel = displayName.replace(/^Gemini\s+/i, '');
      const toastMsg = `${prefix} (${data.workspace || 'summaries'} • ${shortModel})${data.conversationId ? ' • ' + data.conversationId.slice(0, 8) : ''}`;
      await chrome.scripting.executeScript({
        target: { tabId: senderTabId },
        func: showPageToast,
        args: [toastMsg, true, isWarning, data.conversationId || null]
      }).catch(() => {});

      await chrome.action.setBadgeText({ text: isWarning ? '!' : '✓', tabId: senderTabId });
      await chrome.action.setBadgeBackgroundColor({ color: isWarning ? '#f59e0b' : '#10b981', tabId: senderTabId });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: senderTabId });
      }, 2500);
    }
    return true;
  } catch (err) {
    console.error('Failed to start AGY session:', err);
    if (senderTabId) {
      await chrome.scripting.executeScript({
        target: { tabId: senderTabId },
        func: showPageToast,
        args: [`AGY bridge error: ${err.message}`, false, false]
      }).catch(() => {});

      await chrome.action.setBadgeText({ text: '!', tabId: senderTabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: senderTabId });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: senderTabId });
      }, 2500);
    }
    return false;
  }
}

// Helper executed in tab context to copy text & display toast
function copyToClipboardWithToast(text, label = 'Prompt', isWarning = false) {
  function showToast(success, message) {
    const TOAST_ID = '__ai_summarizer_toast__';
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;

    const bgColor = !success
      ? 'rgba(127, 29, 29, 0.95)'
      : isWarning
        ? 'rgba(45, 30, 10, 0.95)'
        : 'rgba(24, 24, 27, 0.95)';

    const borderColor = !success
      ? '1px solid rgba(239, 68, 68, 0.3)'
      : isWarning
        ? '1px solid rgba(245, 158, 11, 0.45)'
        : '1px solid rgba(255, 255, 255, 0.15)';

    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 18px',
      backgroundColor: bgColor,
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      lineHeight: '1.4',
      borderRadius: '8px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
      border: borderColor,
      backdropFilter: 'blur(10px)',
      webkitBackdropFilter: 'blur(10px)',
      opacity: '0',
      transform: 'translateY(-10px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents: 'none',
      userSelect: 'none'
    });

    const iconSvg = !success
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : isWarning
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2500);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(true, `${label} copied to clipboard!`);
    }).catch(() => {
      fallbackCopy();
    });
  } else {
    fallbackCopy();
  }

  function fallbackCopy() {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        showToast(true, `${label} copied to clipboard!`);
      } else {
        showToast(false, `Failed to copy ${label.toLowerCase()} to clipboard`);
      }
    } catch (e) {
      showToast(false, `Failed to copy ${label.toLowerCase()} to clipboard`);
    }
  }
}

async function runExtraction(tab, mode = 'open_tab') {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:') || tab.url.includes('chrome.google.com/webstore')) {
    console.warn("Cannot run on internal browser pages.");
    if (tab.id) {
      chrome.action.setBadgeText({ text: '!', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }, 2000);
    }
    return;
  }

  // Store pending action mode for this tab
  await chrome.storage.session.set({ [`pendingAction_${tab.id}`]: mode });

  let siteType;
  if (tab.url.includes('youtube.com/watch')) {
    siteType = 'youtube';
  } else if (tab.url.includes('news.ycombinator.com/item')) {
    siteType = 'hackernews';
  } else if (tab.url.includes('amazon.com')) {
    siteType = 'amazon';
  } else if (tab.url.includes('leetcode.com')) {
    siteType = 'leetcode';
  } else if (tab.url.includes('zillow.com')) {
    siteType = 'zillow';
  } else if (tab.url.includes('chess.com/events/')) {
    siteType = 'chesscom';
  } else {
    siteType = 'article';
  }

  const needsAllFrames = tab.url.includes('removepaywalls.com');

  try {
    if (siteType === 'article' || siteType === 'zillow') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: needsAllFrames },
        files: ['Readability.js']
      });
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: needsAllFrames },
      files: [EXTRACTORS[siteType]]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: needsAllFrames },
      func: (extractorName) => {
        if (window[extractorName]?.extract) {
          window[extractorName].extract();
        }
      },
      args: [siteType + 'Extractor']
    });
  } catch (err) {
    console.error("Failed to inject extractor:", err);
    await chrome.storage.session.remove(`pendingAction_${tab.id}`);
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
  }
}

// Left-click on extension icon: open a new AI tab
chrome.action.onClicked.addListener(async (tab) => {
  await runExtraction(tab, 'open_tab');
});

// Right-click context menu on extension icon: copy prompt or content
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!targetTab) return;

  if (info.menuItemId === 'send_to_agy') {
    await runExtraction(targetTab, 'send_to_agy');
  } else if (info.menuItemId === 'copy_prompt') {
    await runExtraction(targetTab, 'copy_prompt');
  } else if (info.menuItemId === 'copy_content') {
    await runExtraction(targetTab, 'copy_content');
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const senderTabId = sender?.tab?.id;

  if (message.type === 'extractionDebugLog') {
    const stageColor = message.stage?.startsWith('Resolved')
      ? 'color: #10b981; font-weight: bold;'
      : message.stage?.includes('Error')
        ? 'color: #ef4444; font-weight: bold;'
        : 'color: #0284c7; font-weight: bold;';

    console.log(
      `%c[Service Worker] [${message.stage}] Tab ${senderTabId || '?'}:`,
      stageColor,
      message.details || {}
    );
    return;
  }

  if (message.type === 'openAgySession' && message.conversationId) {
    fetch(`http://127.0.0.1:8787/api/open-agy?id=${encodeURIComponent(message.conversationId)}`)
      .then((r) => r.json())
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (message.type === 'checkPendingAction') {
    if (senderTabId) {
      const actionKey = `pendingAction_${senderTabId}`;
      const actionResult = await chrome.storage.session.get(actionKey);
      const action = actionResult ? actionResult[actionKey] : null;
      if (action === 'summarize_and_replace' || action === 'summarize_and_close' || action === 'summarize_and_replace_running') {
        console.log(`%c[Service Worker] checkPendingAction -> triggering extraction on tab ${senderTabId} (action: ${action})`, 'color: #8b5cf6;');
        await chrome.storage.session.set({ [actionKey]: 'summarize_and_replace_running' });
        sendResponse({ shouldExtract: true, action: action });
        return true;
      }
    }
    sendResponse({ shouldExtract: false });
    return true;
  }

  if (message.type === 'summarizeYouTubeFromHome') {
    console.log(`%c[Service Worker] Summarize from Home received for URL: ${message.videoUrl}`, 'color: #8b5cf6; font-weight: bold;');
    const service = await ensureAgyDefaultMigrated();
    if (service === 'antigravity' || service === 'agy') {
      await sendPromptToAgySession({
        videoUrl: message.videoUrl,
        videoId: message.videoId,
        videoTitle: message.videoTitle || ''
      }, senderTabId, false);
      sendResponse({ ok: true });
      return true;
    }
    chrome.tabs.create({
      url: message.videoUrl,
      active: true
    }, (newTab) => {
      const storageKey = `pendingAction_${newTab.id}`;
      chrome.storage.session.set({ [storageKey]: 'summarize_and_replace' });
      console.log(`%c[Service Worker] Opened Watch Tab ${newTab.id}, set pendingAction = summarize_and_replace`, 'color: #8b5cf6;');
    });
    return;
  }

  if (message.type === 'extractedText') {
    let mode = 'open_tab';
    if (senderTabId) {
      const storageKey = `pendingAction_${senderTabId}`;
      const stored = await chrome.storage.session.get(storageKey);
      if (stored && stored[storageKey]) {
        mode = stored[storageKey];
        await chrome.storage.session.remove(storageKey);
      }
    }

    console.group(`%c[Service Worker] Transcript Extraction Received (Tab ${senderTabId || '?'})`, 'color: #10b981; font-weight: bold; font-size: 13px;');
    console.log('Video Title:', message.videoTitle || 'N/A');
    console.log('Video URL:', message.videoUrl || sender?.tab?.url || 'N/A');
    console.log('Video Duration:', message.videoDuration || 'N/A');
    console.log('Transcript Status:', message.transcriptStatus || 'N/A');
    console.log('Warning Banner (Truncated?):', message.hasWarning ? '⚠️ YES' : '✓ NO (Complete)');
    console.log('Transcript Text Length:', message.transcriptText?.length || 0, 'chars');
    console.log('Total Output Payload Length:', message.text?.length || 0, 'chars');
    console.log('Target Action Mode:', mode);
    console.groupEnd();

    if (mode === 'copy_prompt') {
      if (senderTabId) {
        const isWarning = !!message.hasWarning;
        const label = isWarning ? 'Prompt (⚠️ Notice)' : 'Prompt';
        try {
          await chrome.scripting.executeScript({
            target: { tabId: senderTabId },
            func: copyToClipboardWithToast,
            args: [message.text, label, isWarning]
          });

          chrome.action.setBadgeText({ text: isWarning ? '!' : '✓', tabId: senderTabId });
          chrome.action.setBadgeBackgroundColor({ color: isWarning ? '#f59e0b' : '#10b981', tabId: senderTabId });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '', tabId: senderTabId });
          }, 2500);
        } catch (err) {
          console.error("Failed to copy prompt to clipboard:", err);
        }
      }
      return;
    }

    if (mode === 'copy_content') {
      if (senderTabId) {
        const textToCopy = message.contentOnly || message.text;
        const isWarning = !!message.hasWarning;
        const label = isWarning ? 'Content (⚠️ Notice)' : 'Content';
        try {
          await chrome.scripting.executeScript({
            target: { tabId: senderTabId },
            func: copyToClipboardWithToast,
            args: [textToCopy, label, isWarning]
          });

          chrome.action.setBadgeText({ text: isWarning ? '!' : '✓', tabId: senderTabId });
          chrome.action.setBadgeBackgroundColor({ color: isWarning ? '#f59e0b' : '#10b981', tabId: senderTabId });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '', tabId: senderTabId });
          }, 2500);
        } catch (err) {
          console.error("Failed to copy content to clipboard:", err);
        }
      }
      return;
    }

    if (mode === 'send_to_agy') {
      await sendPromptToAgySession(message, senderTabId, false);
      return;
    }

    if (mode === 'summarize_and_replace' || mode === 'summarize_and_replace_running') {
      if (senderTabId) {
        const service = await ensureAgyDefaultMigrated();
        if (service === 'antigravity' || service === 'agy') {
          await sendPromptToAgySession(message, senderTabId, true);
          return;
        }
        const url = SERVICE_URLS[service] || SERVICE_URLS.claude;
        console.log(`%c[Service Worker] Navigating Tab ${senderTabId} to AI provider (${service}): ${url}`, 'color: #8b5cf6; font-weight: bold;');
        const storageKey = `extractedText_${senderTabId}`;
        chrome.storage.session.set({ [storageKey]: message.text }, () => {
          chrome.tabs.update(senderTabId, { url: url });
        });
      }
      return;
    }

    // Default: 'open_tab'
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const service = await ensureAgyDefaultMigrated();
      if (service === 'antigravity' || service === 'agy') {
        await sendPromptToAgySession(message, senderTabId || (tabs && tabs[0]?.id), false);
        return;
      }
      const url = SERVICE_URLS[service] || SERVICE_URLS.claude;
      const targetIndex = (tabs && tabs[0]) ? tabs[0].index : 0;
      console.log(`%c[Service Worker] Opening new AI tab for provider (${service}): ${url}`, 'color: #8b5cf6; font-weight: bold;');

      chrome.tabs.create({
        url: url,
        index: targetIndex + 1,
        active: false
      }, (newTab) => {
        const storageKey = `extractedText_${newTab.id}`;
        chrome.storage.session.set({ [storageKey]: message.text });
      });
    });
  } else if (message.type === 'extractionError') {
    console.error(`%c[Service Worker] Extraction error on Tab ${senderTabId}:`, message.error, message.details);
    if (senderTabId) {
      const storageKey = `pendingAction_${senderTabId}`;
      const stored = await chrome.storage.session.get(storageKey);
      if (stored && (stored[storageKey] === 'summarize_and_close' || stored[storageKey] === 'summarize_and_close_running')) {
        chrome.tabs.remove(senderTabId).catch(() => {});
      }
      await chrome.storage.session.remove(storageKey);
      chrome.action.setBadgeText({ text: '!', tabId: senderTabId });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: senderTabId });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: senderTabId });
      }, 2000);
    }
  }
});

let botInjectionQueue = Promise.resolve();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // If this tab is a temporary YouTube watch tab triggered from Home page
    const actionKey = `pendingAction_${tabId}`;
    const actionResult = await chrome.storage.session.get(actionKey);
    const action = actionResult ? actionResult[actionKey] : null;
    if ((action === 'summarize_and_close' || action === 'summarize_and_replace') && tab.url && tab.url.includes('youtube.com/watch')) {
      // Consume the action immediately so subsequent onUpdated complete events cannot trigger extraction twice
      await chrome.storage.session.set({ [actionKey]: action + '_running' });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['sites/youtube.js']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            if (window.youtubeExtractor?.extract) {
              window.youtubeExtractor.extract();
            }
          }
        });
      } catch (err) {
        console.error("Failed to execute extraction on temporary watch tab:", err);
      }
      return;
    }

    const storageKey = `extractedText_${tabId}`;
    const storageResult = await chrome.storage.session.get(storageKey);
    const textPayload = storageResult[storageKey];

    if (textPayload) {
      let service;
      if (tab.url.includes('claude.ai')) {
        service = 'claude';
      } else if (tab.url.includes('chat.deepseek.com')) {
        service = 'deepseek';
      } else if (tab.url.includes('chatgpt.com')) {
        service = 'chatgpt';
      } else if (tab.url.includes('aistudio.google.com')) {
        service = 'aistudio';
      } else if (tab.url.includes('gemini.google.com')) {
        service = 'gemini';
      } else {
        return;
      }

      // Serialize injections across concurrent tabs to prevent system clipboard race conditions
      botInjectionQueue = botInjectionQueue.then(async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [`bots/${service}.js`]
          });

          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (handlerName, text) => {
              if (window[handlerName]?.input) {
                window[handlerName].input(text);
              }
            },
            args: [HANDLERS[service], textPayload]
          });

          await chrome.storage.session.remove(storageKey);
          await new Promise(r => setTimeout(r, 600)); // Buffer to avoid concurrent tab paste races
        } catch (err) {
          console.error("Failed to inject into AI bot tab:", err);
        }
      }).catch(err => {
        console.error("Bot injection queue error:", err);
      });
    }
  }
});