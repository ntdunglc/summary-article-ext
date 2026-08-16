window.youtubeExtractor = {
    getPrompt() {
        return `You are an expert AI video analyst. Your goal is to create a comprehensive, insightful, and well-structured summary of a YouTube video using the provided metadata, description, and transcript.

Your output must strictly follow the markdown template below. Do not add any introductory or concluding remarks outside of this template. Make sure your output has all the sections and no duplicate sections.

===template===
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
==end of template===

Based on the information that follows, generate the summary.
`;
    },

    getDurationInSeconds() {
        const player = document.getElementById('movie_player');
        if (player && typeof player.getDuration === 'function') {
            const d = player.getDuration();
            if (typeof d === 'number' && !isNaN(d) && d > 0) return d;
        }

        const isAd = document.querySelector('.ad-showing, .ad-interrupting');
        const video = document.querySelector('video.html5-main-video, video');
        if (!isAd && video && video.duration && !isNaN(video.duration) && video.duration > 0) {
            return video.duration;
        }

        const timeDisplay = document.querySelector('.ytp-time-duration');
        if (timeDisplay && timeDisplay.textContent) {
            const parts = timeDisplay.textContent.trim().split(':').map(Number);
            if (parts.every(n => !isNaN(n))) {
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                if (parts.length === 2) return parts[0] * 60 + parts[1];
            }
        }

        const metaDuration = document.querySelector('meta[itemprop="duration"]')?.getAttribute('content');
        if (metaDuration) {
            const match = metaDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const hours = parseInt(match[1] || '0', 10);
                const mins = parseInt(match[2] || '0', 10);
                const secs = parseInt(match[3] || '0', 10);
                const total = hours * 3600 + mins * 60 + secs;
                if (total > 0) return total;
            }
        }

        return 0;
    },

    async getTranscriptDirectly() {
        try {
            const player = document.getElementById('movie_player');
            const playerResponse = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
            const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

            if (captionTracks && captionTracks.length > 0) {
                const enTrack = captionTracks.find(t => t.languageCode === 'en' || t.vssId?.includes('.en')) || captionTracks[0];
                if (enTrack && enTrack.baseUrl) {
                    const response = await fetch(enTrack.baseUrl);
                    const xmlText = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                    const textNodes = xmlDoc.querySelectorAll('text');

                    if (textNodes.length > 0) {
                        let transcriptText = '';
                        let currentParagraph = '';
                        let currentTimestamp = '';

                        textNodes.forEach((node) => {
                            const startSec = parseFloat(node.getAttribute('start') || '0');
                            let text = (node.textContent || '')
                                .replace(/&#39;/g, "'")
                                .replace(/&quot;/g, '"')
                                .replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/\s+/g, ' ')
                                .trim();

                            if (!text) return;

                            const minutes = Math.floor(startSec / 60);
                            const seconds = Math.floor(startSec % 60);
                            const timestamp = `${minutes}:${String(seconds).padStart(2, '0')}`;

                            if (currentParagraph === '') {
                                currentTimestamp = timestamp;
                            }
                            currentParagraph += text + ' ';

                            if (currentParagraph.length > 250) {
                                transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                                currentParagraph = '';
                                currentTimestamp = '';
                            }
                        });

                        if (currentParagraph) {
                            transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                        }

                        if (transcriptText.trim()) {
                            return transcriptText.trim();
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('Direct caption fetch failed:', err);
        }
        return null;
    },

    extract() {
        const getVideoDurationFormatted = () => {
            const duration = this.getDurationInSeconds();
            if (!duration || duration <= 0) return 'N/A';
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
            return infoText ? infoText.textContent.trim() : 'N/A';
        };

        const getDescription = () => {
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
            try {
                const titleElement = document.querySelector('#title h1, #title');
                const videoTitle = titleElement ? titleElement.textContent.trim() : document.title.replace(/ - YouTube$/, '');

                const channelElement = document.querySelector('#channel-name #text, ytd-channel-name #text');
                const channelName = channelElement ? channelElement.textContent.trim() : 'N/A';

                const videoDuration = getVideoDurationFormatted();
                const info = getVideoInfo();
                const videoUrl = window.location.href;

                const descResult = getDescription();
                const descriptionText = descResult.text;
                const descriptionLinks = descResult.links;

                // 1. Attempt clean direct transcript extraction from player captions (fast, silent, no DOM mutations)
                let transcriptText = await this.getTranscriptDirectly();

                // 2. Fallback if captions are not returned
                if (!transcriptText) {
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
                console.error('Failure in YouTube extraction:', error);
                chrome.runtime.sendMessage({
                    type: 'extractionError',
                    error: 'Failed to extract video data',
                    details: error.message
                });
            }
        })();
    }
};

// Self-contained YouTube auto-run listener (no global variables, no storage)
(function () {
    if (window.top !== window.self) return;

    let activeVideoId = null;

    function handleNavigation() {
        const url = new URL(window.location.href);
        if (url.pathname !== '/watch') {
            activeVideoId = null;
            return;
        }

        const videoId = url.searchParams.get('v');
        if (!videoId || videoId === activeVideoId) {
            return;
        }
        activeVideoId = videoId;

        // Give the player 1.5 seconds to load duration data
        setTimeout(() => {
            if (new URL(window.location.href).searchParams.get('v') !== videoId) return;

            const duration = window.youtubeExtractor?.getDurationInSeconds?.() || 0;
            // Auto-run if duration is greater than 10 minutes (600 seconds)
            if (duration >= 600) {
                window.youtubeExtractor.extract();
            }
        }, 1500);
    }

    window.addEventListener('yt-navigate-finish', handleNavigation);

    if (window.location.pathname === '/watch') {
        handleNavigation();
    }
})();