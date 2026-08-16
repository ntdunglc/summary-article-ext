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

    async getTranscript() {
        const clickButtonWithText = (text) => {
            const elements = Array.from(document.querySelectorAll('tp-yt-paper-item, button, span, yt-formatted-string, ytd-button-renderer, ytd-menu-service-item-renderer, yt-chip-cloud-chip-renderer'));
            const button = elements.find(el =>
                el.textContent?.trim().toLowerCase() === text.toLowerCase() && el.offsetParent !== null
            );
            if (button) {
                (button.closest('button, [role="tab"], [role="button"], yt-chip-cloud-chip-renderer, tp-yt-paper-item') || button).click();
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

        // Extract and format transcript from raw text lines containing timestamps
        const parseTranscriptFromText = (rawText) => {
            if (!rawText || rawText.length < 20) return null;
            const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
            let transcriptText = '';
            let currentParagraph = '';
            let currentTimestamp = '';
            let foundCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Skip navigation/header markers and duration tokens
                if (/^(In this video|Chapters|Transcript|Search transcript|Search in video|English|Auto-generated|\d+\s+seconds?)$/i.test(line)) {
                    continue;
                }
                if (line.startsWith('Chapter ')) {
                    continue;
                }

                // Format 1: Standalone timestamp line (e.g. "0:00")
                const timeOnly = line.match(/^(\d+:\d+(?::\d+)?)$/);
                if (timeOnly) {
                    const ts = timeOnly[1];
                    let nextIdx = i + 1;
                    while (nextIdx < lines.length && /^(\d+\s+seconds?)$/i.test(lines[nextIdx])) {
                        nextIdx++;
                    }
                    const nextLine = lines[nextIdx] || '';
                    if (nextLine && !/^(\d+:\d+(?::\d+)?)$/.test(nextLine) && !nextLine.startsWith('Chapter ')) {
                        if (currentParagraph && currentParagraph.length > 200) {
                            transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                            currentParagraph = '';
                            currentTimestamp = '';
                        }
                        if (!currentTimestamp) currentTimestamp = ts;
                        currentParagraph += (currentParagraph ? ' ' : '') + nextLine;
                        foundCount++;
                        i = nextIdx;
                    }
                    continue;
                }

                // Format 2: Line with timestamp prefix (e.g. "0:00 This is an NVIDIA B200.")
                const timeWithText = line.match(/^(\d+:\d+(?::\d+)?)\s+(.*)/);
                if (timeWithText) {
                    const ts = timeWithText[1];
                    const content = timeWithText[2].trim();
                    if (content && !/^\d+\s+seconds?$/i.test(content)) {
                        if (currentParagraph && currentParagraph.length > 200) {
                            transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                            currentParagraph = '';
                            currentTimestamp = '';
                        }
                        if (!currentTimestamp) currentTimestamp = ts;
                        currentParagraph += (currentParagraph ? ' ' : '') + content;
                        foundCount++;
                    }
                    continue;
                }

                // Format 3: Continuation speech text
                if (foundCount > 0 && currentParagraph && !/^\d+\s+seconds?$/i.test(line)) {
                    currentParagraph += ' ' + line;
                }
            }

            if (currentParagraph) {
                transcriptText += `[${currentTimestamp || '0:00'}] ${currentParagraph.trim()}\n\n`;
            }

            return (foundCount >= 2) ? transcriptText.trim() : null;
        };

        const tryExtractFromActivePanels = () => {
            // Find all potential transcript panel containers in modern and legacy YouTube layouts
            const panels = Array.from(document.querySelectorAll(
                'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"], ' +
                '[target-id="PAmodern_transcript_view"], ' +
                '[target-id="engagement-panel-searchable-transcript"], ' +
                '[target-id*="transcript" i], ' +
                'ytd-transcript-renderer, ' +
                'ytd-transcript-search-panel-renderer, ' +
                'ytd-transcript-segment-list-renderer, ' +
                'ytd-engagement-panel-section-list-renderer:not([visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"])'
            ));

            for (const panel of panels) {
                const text = panel.innerText;
                const parsed = parseTranscriptFromText(text);
                if (parsed) return parsed;
            }

            return null;
        };

        try {
            // 1. Check if transcript is ALREADY open and readable in the DOM
            let directResult = tryExtractFromActivePanels();
            if (directResult) return directResult;

            // 2. Expand description if collapsed
            const expandBtn = await waitForElement(
                'ytd-text-inline-expander#description-inline-expander #expand, ' +
                '#description #expand, ' +
                'tp-yt-paper-button#expand, ' +
                'ytd-text-inline-expander#description-inline-expander',
                4000
            );
            if (expandBtn) {
                expandBtn.click();
                await new Promise(r => setTimeout(r, 400));
            }

            // 3. Click "Show transcript" button in description
            let clicked = false;
            const descSection = await waitForElement('ytd-video-description-transcript-section-renderer', 2500);
            if (descSection) {
                const btn = descSection.querySelector('button, [role="button"]') || descSection;
                btn.click();
                clicked = true;
            }

            if (!clicked) {
                clicked = clickButtonWithText('Show transcript') || clickButtonWithText('Transcript') || clickButtonWithText('Open transcript');
            }

            // 4. Fallback: Click 3-dots "More actions" menu -> Show transcript
            if (!clicked) {
                const menuButton = await waitForElement('button[aria-label="More actions"], #actions button[aria-label*="More"], ytd-menu-renderer yt-icon-button#button', 2500);
                if (menuButton) {
                    menuButton.click();
                    await new Promise(r => setTimeout(r, 400));
                    clicked = clickButtonWithText('Show transcript') || clickButtonWithText('Open transcript') || clickButtonWithText('Transcript');
                }
            }

            // 5. If "In this video" panel opened on the Chapters tab, click the "Transcript" tab chip
            const clickVisibleTranscriptTab = () => {
                const transcriptChips = Array.from(document.querySelectorAll('yt-chip-cloud-chip-renderer, button, [role="tab"], tp-yt-paper-item, yt-formatted-string, span, div'))
                    .filter(el => el.textContent && el.textContent.trim() === 'Transcript' && el.children.length === 0 && el.offsetParent !== null);
                for (const chip of transcriptChips) {
                    (chip.closest('button, [role="tab"], [role="button"], yt-chip-cloud-chip-renderer') || chip).click();
                    return true;
                }
                return false;
            };

            await new Promise(r => setTimeout(r, 500));
            clickVisibleTranscriptTab();

            // 6. Poll for rendered transcript lines in the panel (up to 8 seconds)
            for (let i = 0; i < 35; i++) {
                await new Promise(r => setTimeout(r, 200));
                if (i === 2 || i === 6 || i === 12) {
                    clickVisibleTranscriptTab();
                }
                const res = tryExtractFromActivePanels();
                if (res) return res;
            }
        } catch (err) {
            console.warn('UI transcript extraction error:', err);
        }

        return null;
    },

    extract() {
        if (this._isExtracting) return;
        this._isExtracting = true;

        const waitForElement = async (selector, timeout = 7000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const element = document.querySelector(selector);
                if (element) return element;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return null;
        };

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
            const infoText = document.querySelector('ytd-watch-info-text #info, ytd-watch-metadata #info');
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
                // Ensure page metadata and player components are mounted before extracting
                await waitForElement('ytd-watch-metadata, #description-inline-expander, #movie_player, #title', 7000);
                await new Promise(r => setTimeout(r, 400));

                const titleElement = document.querySelector('#title h1, #title, ytd-watch-metadata #title');
                const videoTitle = titleElement ? titleElement.textContent.trim() : document.title.replace(/ - YouTube$/, '');

                const channelElement = document.querySelector('#channel-name #text, ytd-channel-name #text');
                const channelName = channelElement ? channelElement.textContent.trim() : 'N/A';

                const videoDuration = getVideoDurationFormatted();
                const info = getVideoInfo();
                const videoUrl = window.location.href;

                const descResult = getDescription();
                const descriptionText = descResult.text;
                const descriptionLinks = descResult.links;

                // 1. Pure UI Click & Copy transcript extraction
                let transcriptText = await this.getTranscript();

                // 2. Fallback if captions are not returned
                if (!transcriptText) {
                    transcriptText = `Transcript could not be extracted directly (captions may be disabled or processing). Please use the video URL and detailed description/chapters above to analyze the content: ${videoUrl}`;
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
            } finally {
                this._isExtracting = false;
            }
        })();
    }
};

// Self-contained button injector for video cards across YouTube (Home, Feeds, Search)
(function () {
    if (window.top !== window.self) return;

    function ensureStyles() {
        if (document.getElementById('__yt_ai_summarize_styles__')) return;
        const style = document.createElement('style');
        style.id = '__yt_ai_summarize_styles__';
        style.textContent = `
            .yt-ai-summarize-badge {
                position: absolute !important;
                top: 8px !important;
                left: 8px !important;
                z-index: 50 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 32px !important;
                height: 32px !important;
                padding: 0 !important;
                background: rgba(15, 23, 42, 0.88) !important;
                color: #38bdf8 !important;
                border: 1px solid rgba(56, 189, 248, 0.45) !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
                transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45) !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
                transform: scale(0.9) !important;
            }

            /* Only show button on hover of the video card or thumbnail */
            yt-lockup-view-model:hover .yt-ai-summarize-badge,
            ytd-rich-item-renderer:hover .yt-ai-summarize-badge,
            ytd-video-renderer:hover .yt-ai-summarize-badge,
            ytd-grid-video-renderer:hover .yt-ai-summarize-badge,
            ytd-compact-video-renderer:hover .yt-ai-summarize-badge,
            .yt-lockup-view-model-wiz__content-image:hover .yt-ai-summarize-badge,
            ytd-thumbnail:hover .yt-ai-summarize-badge,
            #thumbnail:hover .yt-ai-summarize-badge {
                opacity: 0.95 !important;
                visibility: visible !important;
                pointer-events: auto !important;
                transform: scale(1) !important;
            }

            .yt-ai-summarize-badge:hover {
                opacity: 1 !important;
                background: rgba(15, 23, 42, 1) !important;
                border-color: #38bdf8 !important;
                box-shadow: 0 4px 14px rgba(56, 189, 248, 0.5) !important;
                transform: scale(1.12) !important;
                color: #ffffff !important;
            }

            .yt-ai-summarize-badge svg {
                width: 17px !important;
                height: 17px !important;
                stroke: currentColor !important;
                flex-shrink: 0 !important;
            }

            .yt-ai-summarize-badge .yt-ai-spinner {
                display: none !important;
            }

            .yt-ai-summarize-badge.is-loading .yt-ai-sparkle {
                display: none !important;
            }

            .yt-ai-summarize-badge.is-loading .yt-ai-spinner {
                display: block !important;
                animation: yt-ai-spin 1s linear infinite !important;
            }

            .yt-ai-summarize-badge.is-loading {
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: auto !important;
                background: rgba(2, 132, 199, 0.95) !important;
                border-color: #38bdf8 !important;
                cursor: wait !important;
                color: #ffffff !important;
                transform: scale(1) !important;
            }

            @keyframes yt-ai-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function createSvgIcons() {
        const svgNS = 'http://www.w3.org/2000/svg';

        // Sparkle SVG
        const sparkleSvg = document.createElementNS(svgNS, 'svg');
        sparkleSvg.setAttribute('viewBox', '0 0 24 24');
        sparkleSvg.setAttribute('fill', 'none');
        sparkleSvg.setAttribute('stroke', 'currentColor');
        sparkleSvg.setAttribute('stroke-width', '2.2');
        sparkleSvg.setAttribute('stroke-linecap', 'round');
        sparkleSvg.setAttribute('stroke-linejoin', 'round');
        sparkleSvg.classList.add('yt-ai-sparkle');

        const p1 = document.createElementNS(svgNS, 'path');
        p1.setAttribute('d', 'm12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z');
        const p2 = document.createElementNS(svgNS, 'path');
        p2.setAttribute('d', 'M5 3v4M3 5h4M19 17v4M17 19h4');
        sparkleSvg.appendChild(p1);
        sparkleSvg.appendChild(p2);

        // Spinner SVG
        const spinnerSvg = document.createElementNS(svgNS, 'svg');
        spinnerSvg.setAttribute('viewBox', '0 0 24 24');
        spinnerSvg.setAttribute('fill', 'none');
        spinnerSvg.setAttribute('stroke', 'currentColor');
        spinnerSvg.setAttribute('stroke-width', '2.5');
        spinnerSvg.setAttribute('stroke-linecap', 'round');
        spinnerSvg.setAttribute('stroke-linejoin', 'round');
        spinnerSvg.classList.add('yt-ai-spinner');

        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', '12');
        c.setAttribute('cy', '12');
        c.setAttribute('r', '9');
        c.setAttribute('stroke-opacity', '0.25');

        const spPath = document.createElementNS(svgNS, 'path');
        spPath.setAttribute('d', 'M12 3a9 9 0 0 1 9 9');

        spinnerSvg.appendChild(c);
        spinnerSvg.appendChild(spPath);

        return { sparkleSvg, spinnerSvg };
    }

    function injectCardButtons() {
        ensureStyles();

        // Query all video card elements across modern & classic YouTube layouts
        const cards = document.querySelectorAll(
            'yt-lockup-view-model:not([data-ai-btn]), ' +
            'ytd-rich-item-renderer:not([data-ai-btn]), ' +
            'ytd-video-renderer:not([data-ai-btn]), ' +
            'ytd-grid-video-renderer:not([data-ai-btn]), ' +
            'ytd-compact-video-renderer:not([data-ai-btn])'
        );

        cards.forEach((card) => {
            // Find watch link with valid video ID
            const link = card.querySelector(
                'a[href*="/watch?v="], ' +
                'a[href*="watch?v="], ' +
                'a.ytLockupMetadataViewModelTitle, ' +
                'a#video-title-link, ' +
                'a#video-title, ' +
                'a#thumbnail'
            );

            if (!link) return;
            const href = link.getAttribute('href') || link.href;
            if (!href) return;

            const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (!match) return;
            const videoId = match[1];

            // Find the best thumbnail container to host the top-left overlay badge
            const thumb = card.querySelector(
                '.yt-lockup-view-model-wiz__content-image, ' +
                '.ytLockupViewModelContentImage, ' +
                'ytd-thumbnail, ' +
                '#thumbnail, ' +
                'a.yt-lockup-view-model-wiz__content-image, ' +
                'a#thumbnail'
            ) || card;

            // Prevent injecting multiple buttons if child/parent already processed
            if (thumb.querySelector('.yt-ai-summarize-badge') || card.querySelector('.yt-ai-summarize-badge')) {
                card.dataset.aiBtn = 'true';
                return;
            }

            // Only mark card as processed once we actually inject the button
            card.dataset.aiBtn = 'true';

            const btn = document.createElement('button');
            btn.className = 'yt-ai-summarize-badge';
            btn.title = 'Summarize with AI';

            const { sparkleSvg, spinnerSvg } = createSvgIcons();
            btn.appendChild(sparkleSvg);
            btn.appendChild(spinnerSvg);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.classList.contains('is-loading')) return;
                btn.classList.add('is-loading');

                const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const payload = {
                    type: 'summarizeYouTubeFromHome',
                    videoUrl: targetUrl,
                    videoId: videoId
                };

                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage(payload);
                } else if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
                    browser.runtime.sendMessage(payload);
                }

                // Automatic safety reset after 6 seconds
                setTimeout(() => {
                    btn.classList.remove('is-loading');
                }, 6000);
            });

            const computedPos = window.getComputedStyle(thumb).position;
            if (computedPos === 'static') {
                thumb.style.position = 'relative';
            }
            thumb.appendChild(btn);
        });
    }

    injectCardButtons();
    setInterval(injectCardButtons, 1000);
    window.addEventListener('yt-navigate-finish', () => setTimeout(injectCardButtons, 500));
})();