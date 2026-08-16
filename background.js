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

// Register context menu for extension icon right-click
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'copy_prompt',
      title: 'Copy Prompt',
      contexts: ['action']
    });
  });
});

// Helper executed in tab context to copy prompt & display toast
function copyPromptToClipboardWithToast(text) {
  function showToast(success, message) {
    const TOAST_ID = '__ai_summarizer_toast__';
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;

    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 18px',
      backgroundColor: success ? 'rgba(24, 24, 27, 0.95)' : 'rgba(127, 29, 29, 0.95)',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      lineHeight: '1.4',
      borderRadius: '8px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
      border: success ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(239, 68, 68, 0.3)',
      backdropFilter: 'blur(10px)',
      webkitBackdropFilter: 'blur(10px)',
      opacity: '0',
      transform: 'translateY(-10px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents: 'none',
      userSelect: 'none'
    });

    const iconSvg = success
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

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
      showToast(true, 'Prompt copied to clipboard!');
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
        showToast(true, 'Prompt copied to clipboard!');
      } else {
        showToast(false, 'Failed to copy prompt to clipboard');
      }
    } catch (e) {
      showToast(false, 'Failed to copy prompt to clipboard');
    }
  }
}

async function runExtraction(tab, mode = 'open_tab') {
  // 1. Safety check: Block internal browser pages
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

  // 2. Routing logic for all supported sites
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
    siteType = 'article'; // Applies to regular news sites AND removepaywalls.com
  }

  // ⭐ THE FIX: Only pierce iframes if the user is strictly on removepaywalls.com
  const needsAllFrames = tab.url.includes('removepaywalls.com');

  try {
    // Inject Readability if needed
    if (siteType === 'article' || siteType === 'zillow') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: needsAllFrames },
        files: ['Readability.js']
      });
    }

    // Inject the specific extractor script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: needsAllFrames },
      files: [EXTRACTORS[siteType]]
    });

    // Execute the extraction
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: needsAllFrames },
      func: (extractorName) => {
        window[extractorName].extract();
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

// Right-click context menu on extension icon: copy prompt to clipboard
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'copy_prompt') {
    const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (targetTab) {
      await runExtraction(targetTab, 'copy_prompt');
    }
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const senderTabId = sender?.tab?.id;

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

    if (mode === 'copy_prompt') {
      // Copy to clipboard & show toast notification on the active page
      if (senderTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: senderTabId },
            func: copyPromptToClipboardWithToast,
            args: [message.text]
          });

          chrome.action.setBadgeText({ text: '✓', tabId: senderTabId });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: senderTabId });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '', tabId: senderTabId });
          }, 2000);
        } catch (err) {
          console.error("Failed to copy prompt to clipboard:", err);
        }
      }
      return;
    }

    // Default: 'open_tab'
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.storage.sync.get({ service: 'claude' }, (result) => {
        const service = result.service.toLowerCase();
        const url = SERVICE_URLS[service] || SERVICE_URLS.claude;
        const targetIndex = (tabs && tabs[0]) ? tabs[0].index : 0;

        chrome.tabs.create({
          url: url,
          index: targetIndex + 1,
          active: false
        }, (newTab) => {
          const storageKey = `extractedText_${newTab.id}`;
          chrome.storage.session.set({ [storageKey]: message.text });
        });
      });
    });
  } else if (message.type === 'extractionError') {
    if (senderTabId) {
      await chrome.storage.session.remove(`pendingAction_${senderTabId}`);
      chrome.action.setBadgeText({ text: '!', tabId: senderTabId });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: senderTabId });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: senderTabId });
      }, 2000);
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const storageKey = `extractedText_${tabId}`;
    const storageResult = await chrome.storage.session.get(storageKey);
    const textPayload = storageResult[storageKey];

    if (textPayload) {
      let service;
      if (tab.url.includes('claude.ai/new')) {
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

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [`bots/${service}.js`]
        });

        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (handlerName, text) => {
            window[handlerName].input(text);
          },
          args: [HANDLERS[service], textPayload]
        });

        chrome.storage.session.remove(storageKey);

      } catch (err) {
        console.error("Failed to inject into AI bot tab:", err);
      }
    }
  }
});