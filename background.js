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

chrome.action.onClicked.addListener(async (tab) => {
  // 1. Safety check: Block internal browser pages
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:') || tab.url.includes('chrome.google.com/webstore')) {
    console.warn("Cannot run on internal browser pages.");
    return;
  }

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
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractedText') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.storage.sync.get({ service: 'claude' }, (result) => {
        const service = result.service.toLowerCase();
        const url = SERVICE_URLS[service] || SERVICE_URLS.claude;

        chrome.tabs.create({
          url: url,
          index: tabs[0].index + 1,
          active: false
        }, (newTab) => {
          const storageKey = `extractedText_${newTab.id}`;
          chrome.storage.session.set({ [storageKey]: message.text });
        });
      });
    });
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