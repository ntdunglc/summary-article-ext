window.youtubeExtractor = {
    getPrompt() {
        return `You are an expert AI video analyst. Your goal is to create a comprehensive, insightful, and well-structured summary of a YouTube video using the provided metadata, description, and transcript.

Your output must strictly follow the markdown template below. Do not add any introductory or concluding remarks outside of this template. Make sure your output has all the sections and no duplicate sections.

<template>
### Video Metadata
**Title:** [YouTube Video Title]
**Channel:** [YouTube Channel Name]
**URL:** [YouTube Video URL]
**Duration:** [Duration] | **Publication Date:** [Publication Date] | **Views:** [Views]
**Extraction Date:** [Date and Time of Extraction]
**Is AI-GENERATED**: Yes/No

---

### Key Points
- Synthesize the 3-5 most crucial takeaways and arguments from the video.
- Highlight key concepts, specific examples, and evidence presented.
- Note any counterarguments or alternative perspectives discussed.
- **Whenever you reference information that comes from an external URL provided in the footnotes, you must add a citation in the format at the end of the sentence, where 'n' is the corresponding footnote number.**

---

### Background Context
- Provide essential context for the video. Explain the topic's significance, relevant history, or foundational concepts.
- If you use external knowledge, briefly state it (e.g., "Drawing on historical context not present in the video...").
- Define any specialized jargon crucial for understanding the content.
- **Cite external URLs from the footnotes using the format where appropriate.**

#### Analogy
- Craft 1-2 simple analogies to clarify the video's main concept, comparing it to an everyday experience to make it more intuitive.

---

### Timestamped Walkthrough
Create an **in-depth, highly granular walkthrough** that follows the video's structure. The depth and detail of this walkthrough MUST scale proportionally with the video's total duration. A long podcast or lecture should result in a highly detailed walkthrough with many sections.

**Sectioning Rules:**
- **Topic-Based, Not Time-Based:** NEVER split a section just because a certain amount of time has passed. A section should be exactly as long or as short as the specific topic requires.
- **Sub-Arguments for Long Themes:** If a single overarching topic lasts a very long time, do not keep it as one massive block. Break it down logically by the speaker's sub-arguments, new examples, or narrative shifts.
- **Continuous Coverage:** Ensure chronological continuity. Do not leave unexplained gaps in time between sections (the end timestamp of one section should generally be the start timestamp of the next, unless explicitly skipping an ad read).
- **Strict Heading Format:** You MUST format every single section and subsection exactly as shown below, using a Level 4 Markdown heading (####).

**FORMAT EXACTLY LIKE THIS FOR EVERY SECTION:**

#### [Start Time - End Time] Specific Topic/Subsection Title
- Write a summary of that segment's content, capturing all main ideas, supporting arguments, and specific examples.
- **Integrate multiple key verbatim quotes** to capture the speaker's exact phrasing and tone.
- **Clearly explain** any complex concepts, jargon, or acronyms as they are introduced.
- Ensure the summary flows logically and connects the ideas presented within that segment.
- Highlight key ideas and phrases.

#### [Next Start Time - Next End Time] Next Topic/Subsection Title
- [Summary details for the next segment...]

*(Continue this strict pattern for the entire video)*

---

### Critical Analysis
Critically analyze the content to identify the following:

- **Novel Insights:**
  - Original ideas, surprising conclusions, or unique perspectives presented.
- **Conventional Takes:**
  - Viewpoints that align with widely accepted knowledge on the topic.
- **Funny Moments:**
  - Any jokes or humorous segments, briefly explaining the context.
- **Potential Biases:**
  - Any potential biases (e.g., confirmation, selection) or one-sided arguments.

---

### Fact-Check & Verification
- Identify 2-3 of the most significant factual claims or data points made in the video.
- **Perform a web search** to verify each claim against reliable, up-to-date sources (e.g., academic journals, reputable news organizations, official reports).
- For each claim, state the verdict: **Confirmed**, **Refuted**, or **Lacks Consensus**.
- Briefly summarize the findings from your search and **provide clickable links** to the primary sources used for verification. The sources should be direct links to sources, not search query.
- If you can't find valid source URLs, never put google search URL as source, they are not valid.

---

### Actionable Advice
Distill actionable advice from the video, tailored for relevant audiences. **Omit any category that is not applicable.**

- **For Individuals:**
  - [Create thematic subcategories (e.g., Mindset, Strategy, Skills) with bulleted advice for personal application.]
- **For Investors:** (if relevant)
  - [Provide bullet points with insights on market trends, investment opportunities, or risks mentioned in the video.]
- **For Software Engineers:** (if relevant)
  - [List technical takeaways, new tools, or methodology suggestions for developers.]
- **For Startup Founders:** (if relevant)
  - [Outline strategic advice, product ideas, or go-to-market insights for entrepreneurs.]

---

### Footnotes
- List all the external URLs that were read to ground the facts and background of this video, numbered sequentially.
- Format: [n] [URL]
</template>

Based on the information that follows, generate the summary.
`;
    },

    extract() {
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

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        const getVideoDuration = () => {
            const video = document.querySelector('video');
            if (!video) return 'N/A';
            const duration = video.duration;
            if (!duration || isNaN(duration)) return 'N/A';
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = Math.floor(duration % 60);
            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        };

        const getVideoInfo = () => {
            const infoText = document.querySelector('ytd-watch-info-text #info');
            return infoText ? infoText.textContent : 'N/A';
        };

        const expandDescription = async () => {
            const expander = document.querySelector('ytd-text-inline-expander#description-inline-expander');
            if (expander) {
                const expandBtn = expander.querySelector('tp-yt-paper-button#expand, button[aria-label*="Show more"], button[aria-label*="More"]');
                const isExpanded = expander.getAttribute('is-expanded') === '' || expander.hasAttribute('is-expanded');
                if (expandBtn && !isExpanded) {
                    expandBtn.click();
                    await sleep(300);
                }
                return;
            }
            const fallbackBtn = document.querySelector('#description tp-yt-paper-button#expand, #description button[aria-label*="Show more"]');
            if (fallbackBtn) {
                fallbackBtn.click();
                await sleep(300);
            }
        };

        const getDescription = async () => {
            await expandDescription();
            const selectors = [
                'ytd-text-inline-expander#description-inline-expander yt-attributed-string',
                'ytd-text-inline-expander#description-inline-expander yt-formatted-string',
                '#description yt-attributed-string',
                '#description yt-formatted-string',
                '#description'
            ];
            let node = null;
            for (const s of selectors) {
                node = document.querySelector(s);
                if (node && node.innerText && node.innerText.trim()) break;
            }
            if (!node || !node.innerText) return { text: 'N/A', links: [] };
            let text = node.innerText.replace(/\n{3,}/g, '\n\n').trim();
            const links = Array.from(node.querySelectorAll('a'))
                .map(a => ({ href: a.href, text: (a.innerText || '').trim() }))
                .filter(l => l.href && l.href.startsWith('http'));
            return { text, links };
        };

        (async () => {
            let videoTitle = 'N/A';
            let channelName = 'N/A';
            let videoUrl = window.location.href;
            let videoDuration = 'N/A';
            let info = 'N/A';
            let descriptionText = 'N/A';
            let descriptionLinks = [];
            let transcriptText = '';

            try {
                const titleElement = document.querySelector('#title');
                videoTitle = titleElement ? titleElement.textContent.trim() : 'N/A';

                const channelElement = document.querySelector('#channel-name #text');
                channelName = channelElement ? channelElement.textContent.trim() : 'N/A';

                videoDuration = getVideoDuration();
                info = getVideoInfo();

                const descResult = await getDescription();
                descriptionText = descResult.text;
                descriptionLinks = descResult.links;

                try {
                    const menuButton = await waitForElement('button[aria-label="More actions"]', 2000);
                    if (!menuButton) throw new Error('Menu button not found');

                    menuButton.click();
                    await sleep(500);

                    if (!await clickButtonWithText('Show transcript')) {
                        if (!await clickButtonWithText('Open transcript')) {
                            throw new Error('Transcript button not found');
                        }
                    }

                    const segmentSelector = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
                    const hasSegments = await waitForElement(segmentSelector);
                    if (!hasSegments) throw new Error('Transcript panel/segments not found');

                    await sleep(1000);
                    const segments = document.querySelectorAll(segmentSelector);

                    let currentParagraph = '';
                    let currentTimestamp = '';

                    segments.forEach((segment) => {
                        const timestampElement = segment.querySelector('.segment-timestamp, .timestamp, #timestamp, .ytwTranscriptSegmentViewModelTimestamp');
                        const textElement = segment.querySelector('.segment-text, .segment-content, div[class*="segment-text"], .yt-core-attributed-string');

                        if (timestampElement && textElement) {
                            const timestamp = timestampElement.textContent.trim();
                            const text = textElement.textContent.trim().replace(/\s+/g, ' ');
                            if (currentParagraph === '') {
                                currentTimestamp = timestamp;
                            }
                            currentParagraph += text + ' ';
                            if (currentParagraph.length > 250) {
                                transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                                currentParagraph = '';
                            }
                        } else {
                            transcriptText += segment.textContent;
                        }
                    });
                    if (currentParagraph) {
                        transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                    }

                    if (!transcriptText) throw new Error('Transcript text empty');

                } catch (transcriptError) {
                    console.warn('Transcript extraction failed, falling back to URL:', transcriptError);
                    transcriptText = `Transcript could not be extracted directly. Please use the video URL to analyze the content: ${videoUrl}`;
                }

                const extractionDate = new Date().toLocaleString();

                let metadataText = `### Video Metadata
**Title:** ${videoTitle}
**Channel:** ${channelName}
**URL:** ${videoUrl}
**Info:** ${videoDuration} • ${info}
**Extraction Date:** ${extractionDate}`;

                let footnotesText = '';
                if (descriptionLinks.length > 0) {
                    footnotesText = '\nHere are the external URLs from the description:\n<description_links>\n';
                    descriptionLinks.forEach((link, index) => {
                        footnotesText += `[${index + 1}] ${link.href}\n`;
                    });
                    footnotesText += '</description_links>';
                }

                const prompt = this.getPrompt();
                let fullText = `${prompt}
${metadataText}
${footnotesText}

Here is the description:
<description>
${descriptionText}
</description>

Here is the transcript:
<transcript>
${transcriptText}
</transcript>`;

                chrome.runtime.sendMessage({
                    type: 'extractedText',
                    text: fullText,
                    contentType: 'youtube',
                    videoTitle: videoTitle,
                    videoChannel: channelName,
                    videoUrl: videoUrl,
                    videoDuration: videoDuration,
                    info: info,
                    videoDescription: descriptionText,
                    videoDescriptionLinks: descriptionLinks
                });

            } catch (error) {
                console.error('Critical failure in extraction:', error);
                chrome.runtime.sendMessage({
                    type: 'extractionError',
                    error: 'Failed to extract video data',
                    details: error.message
                });
            }
        })();
    }
};