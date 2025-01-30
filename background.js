// Prompt templates
const YOUTUBE_PROMPT = `Your output should use the following template:

### Summary
A detailed 1-2 paragraph overview of the video's content, main arguments, and significance. Include the context of why this topic matters and what viewers will learn.

### Key points
- Comprehensive bullet points covering major themes and arguments
- Include specific examples and evidence presented
- Note any counterarguments or alternative perspectives discussed
- Highlight methodology or frameworks introduced

### Analogy
Provide 1-2 carefully crafted analogies that:
1. Compare the main concept to everyday experiences
2. Break down complex relationships between different elements
3. Help visualize abstract concepts through concrete examples

### Walkthrough
The walkthrough should naturally follow the video's own structure and flow. For each distinct section or topic shift in the video:

- Include timestamp ranges [<start> - <end>]
- Provide detailed coverage proportional to the section's length in the original
- Quote important statements verbatim to preserve key insights
- Explain complex concepts as they arise
- Connect ideas to earlier or later parts of the video
- Note real-world applications or examples given
- Preserve the speaker's original organization and progression of ideas
- Match section breaks to natural transition points in the video

### Keywords & Terminology

Term: [Technical term or concept]
- Definition
- Context of use in the video
- Real-world applications
- Related concepts
- Common misconceptions
- Further reading suggestions

You have been tasked with creating a comprehensive educational resource based on a YouTube video transcription. You will act as an expert in the subject matter, combining deep domain knowledge with clear pedagogical approaches.

For the Summary:
- Provide context for why this topic matters
- Identify the target audience and prerequisite knowledge
- Highlight unique insights or perspectives offered

For the Analogies:
- Create multiple layers of comparison
- Address both structural and functional similarities
- Acknowledge limitations of each analogy
- Build from simple to complex comparisons

For the Walkthrough:
- Maintain proportional coverage based on the original transcript
- Preserve the original organizational structure
- Include verbatim quotes for crucial points
- Analyze the reasoning behind key arguments
- Note connections between different sections
- Highlight methodological approaches
- Discuss practical applications
- Address potential questions or confusions

For Keywords:
- Create a comprehensive glossary
- Show relationships between terms
- Provide examples of usage
- Note any field-specific variations in meaning
- Include relevant etymologies when helpful

Additional Guidelines:
- Remove any sponsorship or brand mentions
- Maintain academic tone and rigor
- Include citations for any referenced studies or data
- Note any areas of scholarly debate or uncertainty
- Suggest resources for further learning

Structure each section to support both quick reference and deep understanding, allowing readers to engage at their preferred level of detail.

You are also a transcription AI and you have been provided with a text that may contain mentions of sponsorships or brand names. Your task write what you have been said to do while avoiding any mention of sponsorships or brand names.

The length of your response should reflect the original length of the transcript, if it's a short video, don't elaborate for too long.

Here is the transcript:
`;

const ARTICLE_PROMPT = `Please read the article provided and create a concise, **proportionate** overview. Structure your response in **Markdown** format with these sections:

1. **Key Points**
   - The most important takeaways from the article.

2. **Summary** *(proportional to length)*  
   - Overview of main content and arguments.

3. **Context & Background**  
   - Relevant historical or thematic information.

4. **Analysis**  
   - Main arguments and evidence
   - Potential biases or limitations
   - Writing style and tone

5. **Implications**  
   - Broader significance or impact

**Here is the article:**
`;

const HN_DISCUSSION_PROMPT = `Please analyze this Hacker News discussion thread and create a structured summary in the following format:

### Main Topic
- Title of the post
- Key context and what sparked the discussion

### Major Discussion Threads
For each significant discussion branch (>10 upvotes or significant discussion depth):

#### Branch Topic [upvotes]
- Main argument/point being discussed
- Key perspectives (with usernames)
> Notable quotes that capture the essence of the discussion
- How the discussion evolved/branched

### Technical Details
- Any specific technical information, code, or implementation details discussed
- Corrections or important clarifications made in the thread

### Notable Insights
- Unique perspectives or particularly insightful comments
- Industry experience or historical context shared
- Practical suggestions or solutions proposed

Please preserve the hierarchical nature of the discussions by using proper indentation and connecting related points. Include usernames for significant contributions and upvote counts where relevant.

Use this structure to show how discussions branch and evolve, but feel free to adapt it based on the specific content and flow of the thread.

Here is the discussion:
`;

let extractedText = '';

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url.includes('youtube.com/watch')) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractYouTubeTranscript
    });
  } else if (tab.url.includes('news.ycombinator.com/item')) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractHNDiscussion
    });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['Readability.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractArticle
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractedText') {
    extractedText = {
      content: message.text,
      contentType: message.contentType
    };
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      chrome.tabs.create({ 
        url: 'https://claude.ai/new',
        index: currentTab.index + 1
      });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.includes('claude.ai/new')) {
    if (extractedText) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (data, youtubePrompt, articlePrompt, hnPrompt) => {
          const promptTemplate = data.contentType === 'youtube' ? youtubePrompt + data.content :
                               data.contentType === 'hn' ? hnPrompt + data.content :
                               articlePrompt + data.content;

          const textareas = document.querySelectorAll('[contenteditable="true"]');
          if (textareas && textareas.length > 0) {
            const textarea = textareas[0];
            textarea.textContent = promptTemplate;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
              const sendButton = document.querySelector('button[aria-label="Send Message"]') ||
                              document.querySelector('button.bg-accent-main-100');
              if (sendButton) sendButton.click();
            }, 1000);
          }
        },
        args: [extractedText, YOUTUBE_PROMPT, ARTICLE_PROMPT, HN_DISCUSSION_PROMPT]
      });
      extractedText = '';
    }
  }
});

function extractYouTubeTranscript() {
  const clickButtonWithText = async (text) => {
    const elements = Array.from(document.querySelectorAll('tp-yt-paper-item, button, span'));
    const button = elements.find(el => 
      el.textContent?.trim().toLowerCase() === text.toLowerCase()
    );
    if (button) {
      button.click();
      return true;
    }
    return false;
  };

  const waitForElement = async (selector, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  (async () => {
    try {
      const menuButton = await waitForElement('button[aria-label="More actions"]');
      if (!menuButton) throw new Error('Menu button not found');
      menuButton.click();

      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!await clickButtonWithText('Show transcript')) {
        if (!await clickButtonWithText('Open transcript')) {
          throw new Error('Transcript button not found');
        }
      }

      const transcriptPanel = await waitForElement('ytd-transcript-segment-list-renderer');
      if (!transcriptPanel) throw new Error('Transcript panel not found');

      await new Promise(resolve => setTimeout(resolve, 1000));

      const segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
      let transcriptText = '';
      let currentParagraph = '';
      let currentTimestamp = '';

      segments.forEach((segment) => {
        const textElement = segment.querySelector('.segment-text, .segment-content, div[class*="segment"], div[class*="text"]');
        if (textElement) {
          const text = textElement.textContent.trim().replace(/\s+/g, ' ');
          if (!text) return;

          const match = text.match(/^(\d+:\d+)\s*(.*)/);
          if (match) {
            const [_, timestamp, content] = match;
            if (currentTimestamp && currentParagraph && timestamp !== currentTimestamp) {
              transcriptText += `[${currentTimestamp}] ${currentParagraph}\n\n`;
              currentParagraph = '';
            }
            currentTimestamp = timestamp;
            currentParagraph += (currentParagraph ? ' ' : '') + content;
          }
        }
      });

      if (currentParagraph) {
        transcriptText += `[${currentTimestamp}] ${currentParagraph}\n\n`;
      }

      chrome.runtime.sendMessage({
        type: 'extractedText',
        text: transcriptText,
        contentType: 'youtube'
      });

    } catch (error) {
      console.error('Failed to extract transcript:', error);
    }
  })();
}

function extractArticle() {
  try {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article && article.textContent) {
      const metadata = {
        title: article.title || document.title,
        siteName: article.siteName || new URL(document.location).hostname,
        byline: article.byline || '',
        publishedTime: document.querySelector('meta[property="article:published_time"]')?.content || '',
        url: document.location.href
      };

      const contextInfo = `
Title: ${metadata.title}
Source: ${metadata.siteName}
Author: ${metadata.byline}
Published: ${metadata.publishedTime}
URL: ${metadata.url}
`;

      chrome.runtime.sendMessage({
        type: 'extractedText',
        text: contextInfo + article.textContent,
        contentType: 'article'
      });
    }
  } catch (error) {
    console.error('Error parsing article:', error);
  }
}

const extractHNDiscussion = () => {
  const title = document.querySelector('.titleline')?.innerText || '';
  const points = document.querySelector('.score')?.innerText || '0 points';
  const mainPost = {
    title,
    points,
    url: document.querySelector('.titleline a')?.href || '',
    content: ''
  };

  const comments = [];
  document.querySelectorAll('.comtr').forEach(comment => {
    // Get indentation level
    const indent = parseInt(comment.querySelector('.ind img')?.width || '0');
    const level = indent / 40; // HN uses 40px per indent level

    const username = comment.querySelector('.hnuser')?.innerText || '';
    const text = comment.querySelector('.commtext')?.innerText || '';
    const points = comment.querySelector('.score')?.innerText || '';
    const age = comment.querySelector('.age')?.innerText || '';

    comments.push({
      level,
      username,
      text,
      points,
      age
    });
  });

  // Convert to a readable format with proper indentation
  let formattedDiscussion = `${mainPost.title}\n${mainPost.points}\n${mainPost.url}\n\n`;
  
  comments.forEach(comment => {
    const indent = '  '.repeat(comment.level);
    formattedDiscussion += `${indent}@${comment.username} ${comment.points} ${comment.age}\n`;
    formattedDiscussion += comment.text.split('\n').map(line => `${indent}${line}`).join('\n');
    formattedDiscussion += '\n\n';
  });

  chrome.runtime.sendMessage({
    type: 'extractedText',
    text: formattedDiscussion,
    contentType: 'hn'
  });
};

function inputTextToClaudeTextarea(extractedData) {
  const promptTemplate = extractedData.contentType === 'youtube' ? 
    YOUTUBE_PROMPT + extractedData.content :
    ARTICLE_PROMPT + extractedData.content;

  const textareas = document.querySelectorAll('[contenteditable="true"]');
  if (textareas && textareas.length > 0) {
    const textarea = textareas[0];
    textarea.textContent = promptTemplate;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    setTimeout(() => {
      const sendButton = document.querySelector('button[aria-label="Send Message"]') ||
                        document.querySelector('button.bg-accent-main-100');
      if (sendButton) sendButton.click();
    }, 1000);
  }
}