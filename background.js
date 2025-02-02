const SERVICE_URLS = {
  claude: 'https://claude.ai/new',
  deepseek: 'https://chat.deepseek.com/',
  chatgpt: 'https://chatgpt.com/'
};

const EXTRACTORS = {
  youtube: 'sites/youtube.js',
  article: 'sites/article.js',
  hackernews: 'sites/hackernews.js',
  amazon: 'sites/amazon.js'
};

const HANDLERS = {
  claude: 'claudeBot',
  deepseek: 'deepseekBot',
  chatgpt: 'chatgptBot'
};

let extractedText = '';

chrome.action.onClicked.addListener(async (tab) => {
  let siteType;

  if (tab.url.includes('youtube.com/watch')) {
    siteType = 'youtube';
  } else if (tab.url.includes('news.ycombinator.com/item')) {
    siteType = 'hackernews';
  } else if (tab.url.includes('amazon.com')) {
    siteType = 'amazon';
  } else {
    siteType = 'article';
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
  files: [EXTRACTORS[siteType]]
});

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
  func: (extractorName) => {
    window[extractorName].extract();
  },
  args: [siteType + 'Extractor']
});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractedText') {
    extractedText = message.text;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.storage.sync.get({ service: 'claude' }, (result) => {
        const service = result.service.toLowerCase();
        const url = SERVICE_URLS[service] || SERVICE_URLS.claude;

        chrome.tabs.create({
          url: url,
          index: tabs[0].index + 1
        });
      });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && extractedText) {
    let service;
    if (tab.url.includes('claude.ai/new')) {
      service = 'claude';
    } else if (tab.url.includes('chat.deepseek.com')) {
      service = 'deepseek';
    } else if (tab.url.includes('chatgpt.com')) {
      service = 'chatgpt';
    } else {
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [`bots/${service}.js`]
    }).then(() => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (handlerName, text) => {
          window[handlerName].input(text);
        },
        args: [HANDLERS[service], extractedText]
      });
      extractedText = '';
    });
  }
});