window.youtubeExtractor = {
    getPrompt() {
        return `You are an expert AI video analyst. Your goal is to create a comprehensive, insightful, and well-structured summary of a YouTube video using the provided metadata, description, and transcript.

Your output must strictly follow the markdown template below. Do not add any introductory or concluding remarks outside of this template. Make sure your output has all the sections and no duplicate sections.

**Transcript Instructions:**
- If an explicit \`> [!WARNING]\` banner is provided in the input below (indicating that the transcript is unavailable or severely truncated), include a \`> [!WARNING]\` alert at the top of your summary explaining this limitation, and synthesize the content using the video title, description, chapters, and external URLs.
- Otherwise, the transcript is complete; do not add disclaimers or mention transcript coverage or missing end seconds.

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
Create a **concise, high-signal walkthrough** of the video's major themes so the reader gets the full substance in **~10–15% of the time it would take to watch** (never write a blow-by-blow rewrite that takes nearly as long to read as the segment itself).

**Sectioning & Brevity Rules:**
- **Major Thematic Chapters Only:** Group the video into broad, meaningful chapters spanning roughly **3–8 minutes each** (aim for **4–6 sections** for a 10–25 min video, **6–9 sections** for a 25–60 min video, and **8–12 sections** for a 60+ min podcast). NEVER slice the video into 1–2 minute micro-segments.
- **Continuous Coverage:** Keep timestamps contiguous from start to finish (\`[Start Time - End Time]\`), merging adjacent sub-points into a single thematic chapter.
- **Strict Length Cap per Section:** Write **2–4 tight bullet points per section** (1–2 sentences per bullet). Synthesize the core argument, mechanism, or concrete example—omit throat-clearing, anecdotes, and repetition.
- **Selective Quotes:** Include **at most 1 short verbatim quote** per section, and only when the exact phrasing is memorable or load-bearing.
- **Strict Heading Format:** Format every section using a Level 4 Markdown heading (\`####\`):

**FORMAT EXACTLY LIKE THIS FOR EVERY SECTION:**

#### [Start Time - End Time] Specific Topic/Chapter Title
- Distill the core claim, technical mechanism, or takeaway in 2–4 concise bullets.
- Define any critical new jargon inline in one short clause, and include at most one short verbatim quote if genuinely impactful.

#### [Next Start Time - Next End Time] Next Topic/Chapter Title
- [2–4 concise bullets for the next chapter...]

*(Continue this pattern for the entire video)*

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
===end of template===

Based on the information that follows, generate the summary.
`;
    },

    sendLog(stage, details = {}) {
        const logPayload = {
            type: 'extractionDebugLog',
            site: 'youtube',
            stage: stage,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            details: details
        };
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage(logPayload).catch(() => {});
            } else if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
                browser.runtime.sendMessage(logPayload).catch(() => {});
            }
        } catch (_) {}
        console.log(`%c[YouTube Extractor] [${stage}]`, 'color: #0284c7; font-weight: bold;', details);
    },

    parseTimestampToSeconds(tsStr) {
        if (!tsStr) return 0;
        const parts = tsStr.trim().split(':').map(Number);
        if (parts.some(isNaN)) return 0;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 1) return parts[0];
        return 0;
    },

    getDurationInSeconds() {
        // 1. Check window.ytInitialPlayerResponse
        try {
            if (window.ytInitialPlayerResponse?.videoDetails?.lengthSeconds) {
                const sec = parseInt(window.ytInitialPlayerResponse.videoDetails.lengthSeconds, 10);
                if (sec > 0) return sec;
            }
        } catch (_) {}

        // 2. Check meta duration in head (always main video, never ads)
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

        // 3. Check document scripts for lengthSeconds or approxDurationMs
        for (const s of document.scripts) {
            if (s.textContent) {
                const m = s.textContent.match(/"lengthSeconds":\s*"(\d+)"/);
                if (m) {
                    const sec = parseInt(m[1], 10);
                    if (sec > 0) return sec;
                }
                const m2 = s.textContent.match(/"approxDurationMs":\s*"(\d+)"/);
                if (m2) {
                    const sec = Math.floor(parseInt(m2[1], 10) / 1000);
                    if (sec > 0) return sec;
                }
            }
        }

        // 4. Check player UI time display
        const timeDisplay = document.querySelector('.ytp-time-duration');
        if (timeDisplay && timeDisplay.textContent) {
            const parts = timeDisplay.textContent.trim().split(':').map(Number);
            if (parts.every(n => !isNaN(n))) {
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                if (parts.length === 2) return parts[0] * 60 + parts[1];
            }
        }

        // 5. Check HTML5 video element only if NOT an ad
        const isAd = document.querySelector('.ad-showing, .ad-interrupting, .video-ads, .ytp-ad-player-overlay');
        const video = document.querySelector('video.html5-main-video, video');
        if (!isAd && video && video.duration && !isNaN(video.duration) && video.duration > 45) {
            return Math.floor(video.duration);
        }

        return 0;
    },

    getVideoDurationFormatted(duration) {
        const dur = typeof duration === 'number' ? duration : this.getDurationInSeconds();
        if (!dur || dur <= 0) return 'N/A';
        const hours = Math.floor(dur / 3600);
        const minutes = Math.floor((dur % 3600) / 60);
        const seconds = Math.floor(dur % 60);
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

        const waitForElement = async (selector, timeout = 4000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const element = document.querySelector(selector);
                if (element) return element;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return null;
        };

        const scrapeSegmentsFromDocument = () => {
            const segmentNodes = Array.from(document.querySelectorAll(
                'ytd-engagement-panel-section-list-renderer[target-id*="transcript"] transcript-segment-view-model, ' +
                'ytd-engagement-panel-section-list-renderer[target-id*="transcript"] ytd-transcript-segment-renderer, ' +
                'ytd-engagement-panel-section-list-renderer[target-id*="chapters"] transcript-segment-view-model, ' +
                '#engagement-panel-searchable-transcript transcript-segment-view-model, ' +
                '#engagement-panel-searchable-transcript ytd-transcript-segment-renderer, ' +
                'transcript-segment-view-model, ' +
                'ytd-transcript-segment-renderer'
            )).filter(el => !el.closest('ytd-watch-next-secondary-results-renderer, #related'));

            if (segmentNodes.length < 2) return null;

            let transcriptText = '';
            let currentParagraph = '';
            let currentTimestamp = '';
            let firstTimestamp = '';
            let lastTimestamp = '';
            let lastTimestampSeconds = 0;
            let count = 0;
            const seen = new Set();

            for (const node of segmentNodes) {
                const tsEl = node.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, div[class*="Timestamp"]:not([class*="A11y"])');
                const textEl = node.querySelector('span[role="text"], .ytAttributedStringHost, .segment-text, [class*="SegmentText"]');
                if (tsEl && textEl) {
                    const tsStr = tsEl.textContent.trim();
                    const text = textEl.textContent.trim();
                    if (tsStr && text) {
                        const key = `${tsStr}_${text}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        
                        if (currentParagraph && currentParagraph.length > 250) {
                            transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
                            currentParagraph = '';
                            currentTimestamp = '';
                        }
                        if (!currentTimestamp) currentTimestamp = tsStr;
                        if (!firstTimestamp) firstTimestamp = tsStr;
                        lastTimestamp = tsStr;
                        lastTimestampSeconds = this.parseTimestampToSeconds(tsStr);
                        currentParagraph += (currentParagraph ? ' ' : '') + text;
                        count++;
                    }
                }
            }

            if (currentParagraph) {
                transcriptText += `[${currentTimestamp}] ${currentParagraph.trim()}\n\n`;
            }

            if (count < 2) return null;

            return {
                text: transcriptText.trim(),
                firstTimestamp: firstTimestamp || '0:00',
                lastTimestamp: lastTimestamp || '0:00',
                lastTimestampSeconds: lastTimestampSeconds || 0,
                count: count
            };
        };

        try {
            let durationSeconds = this.getDurationInSeconds();
            this.sendLog('StartTranscriptScrape', { detectedDurationSeconds: durationSeconds, formattedDuration: this.getVideoDurationFormatted(durationSeconds) });

            // 1. Check if complete transcript is ALREADY mounted in the document
            let directResult = scrapeSegmentsFromDocument();
            if (directResult) {
                this.sendLog('DirectResultCheck', { count: directResult.count, lastTs: directResult.lastTimestamp, lastSec: directResult.lastTimestampSeconds, durationSeconds });
                if (durationSeconds > 120 && directResult.lastTimestampSeconds >= durationSeconds - 120) {
                    this.sendLog('DirectResultComplete', { count: directResult.count, lastTs: directResult.lastTimestamp });
                    return directResult;
                }
            }

            // 2. Expand description if collapsed
            const expandBtn = await waitForElement(
                'ytd-text-inline-expander#description-inline-expander #expand, ' +
                '#description-inline-expander #expand, ' +
                '#description #expand, ' +
                'tp-yt-paper-button#expand, ' +
                'ytd-text-inline-expander#description-inline-expander',
                4000
            );
            if (expandBtn) {
                (expandBtn.querySelector('button') || expandBtn).click();
                await new Promise(r => setTimeout(r, 350));
            }

            // 3. Click "Show transcript" button in description
            let clicked = false;
            const descSection = await waitForElement('ytd-video-description-transcript-section-renderer', 3000);
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
                const menuButton = await waitForElement('ytd-watch-metadata button[aria-label*="More"], ytd-menu-renderer yt-icon-button#button', 2000);
                if (menuButton) {
                    menuButton.click();
                    await new Promise(r => setTimeout(r, 300));
                    clicked = clickButtonWithText('Show transcript') || clickButtonWithText('Open transcript') || clickButtonWithText('Transcript');
                }
            }

            this.sendLog('ActionButtons', { descriptionExpanded: !!expandBtn, showTranscriptClicked: clicked });

            // Locate active transcript panels (includes both searchable transcript and chapter timeline panels)
            const getTranscriptPanels = () => {
                const panels = Array.from(document.querySelectorAll(
                    'ytd-engagement-panel-section-list-renderer[target-id*="transcript"], ' +
                    'ytd-engagement-panel-section-list-renderer[target-id*="chapters"], ' +
                    'ytd-engagement-panel-section-list-renderer#engagement-panel-searchable-transcript, ' +
                    '#engagement-panel-searchable-transcript, ' +
                    'ytd-transcript-search-panel-renderer, ' +
                    'ytd-transcript-renderer'
                ));

                if (panels.length === 0) {
                    const allPanels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
                    for (const p of allPanels) {
                        if (p.querySelector('transcript-segment-view-model, ytd-transcript-segment-renderer, .ytwTranscriptSegmentViewModelTimestamp, ytd-transcript-renderer')) {
                            panels.push(p);
                        }
                    }
                }
                return panels;
            };

            const clickPanelTab = (panel, tabName) => {
                const tabElements = Array.from(panel.querySelectorAll(
                    'chip-view-model, yt-chip-cloud-chip-renderer, button[role="tab"], chip-bar-view-model button, tp-yt-paper-tab, [role="tab"]'
                )).filter(el => el.textContent?.trim().toLowerCase() === tabName.toLowerCase());

                for (const target of tabElements) {
                    const candidates = [target, target.querySelector('button'), target.closest('chip-view-model, yt-chip-cloud-chip-renderer')].filter(Boolean);
                    for (const el of candidates) {
                        try {
                            el.click();
                            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                        } catch (_) {}
                    }
                }
            };

            // Scroll transcript containers strictly inside the transcript panel
            const scrollTranscriptList = () => {
                const transcriptPanels = getTranscriptPanels();

                for (const panel of transcriptPanels) {
                    // 1. Scroll scrollable containers strictly INSIDE the transcript panel
                    const scrollables = Array.from(panel.querySelectorAll('*')).filter(el => {
                        if (el.scrollHeight <= el.clientHeight) return false;
                        if (el.closest('ytd-watch-next-secondary-results-renderer, #related')) return false;
                        return true;
                    });
                    if (panel.scrollHeight > panel.clientHeight) scrollables.push(panel);

                    for (const el of scrollables) {
                        try {
                            el.scrollTop += 800;
                            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
                                el.scrollTop = el.scrollHeight;
                            }
                            el.dispatchEvent(new Event('scroll', { bubbles: true }));
                            el.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
                        } catch (_) {}
                    }

                    // 2. Scroll chapter headers strictly inside this transcript panel
                    const chapterSections = panel.querySelectorAll(
                        'yt-item-section-renderer, ytd-item-section-renderer, timeline-chapter-view-model, macro-markers-panel-item-view-model, ytd-macro-markers-list-item-renderer'
                    );
                    for (const section of chapterSections) {
                        try {
                            section.scrollIntoView({ block: 'end', behavior: 'instant' });
                        } catch (_) {}
                    }

                    // 3. Trigger continuation loaders strictly inside this transcript panel
                    const continuations = panel.querySelectorAll('ytd-continuation-item-renderer');
                    for (const cont of continuations) {
                        try {
                            cont.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                            if (typeof cont.triggerContinuation === 'function') cont.triggerContinuation();
                            if (typeof cont.onVisible === 'function') cont.onVisible();
                            const btn = cont.querySelector('button, tp-yt-paper-button, [role="button"], tp-yt-paper-spinner');
                            if (btn) btn.click();
                            cont.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
                            window.dispatchEvent(new Event('resize'));
                        } catch (_) {}
                    }

                    // 4. Scroll last segment strictly inside this transcript panel into view
                    const segs = panel.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer, .ytwTranscriptSegmentViewModelHost');
                    if (segs.length > 0) {
                        try {
                            segs[segs.length - 1].scrollIntoView({ block: 'end', behavior: 'instant' });
                        } catch (_) {}
                    }
                }
            };

            // Switch to Timeline tab inside panels if present
            await new Promise(r => setTimeout(r, 400));
            const panels = getTranscriptPanels();
            this.sendLog('PanelsLocated', { count: panels.length, panelIds: panels.map(p => p.getAttribute('target-id') || p.tagName) });

            for (const panel of panels) {
                const hasTimeline = Array.from(panel.querySelectorAll('chip-view-model, button[role="tab"]')).some(
                    el => el.textContent?.trim().toLowerCase() === 'timeline'
                );
                if (hasTimeline) {
                    clickPanelTab(panel, 'Timeline');
                }
            }

            let bestResult = null;
            let lastSegmentCount = 0;
            let unchangedRounds = 0;

            // Extended Polling Loop
            for (let i = 0; i < 120; i++) {
                await new Promise(r => setTimeout(r, 250));

                if (durationSeconds === 0) {
                    durationSeconds = this.getDurationInSeconds();
                }

                scrollTranscriptList();

                const currentRes = scrapeSegmentsFromDocument();
                if (currentRes) {
                    if (!bestResult || currentRes.count > bestResult.count) {
                        bestResult = currentRes;
                    }

                    if (currentRes.lastTimestampSeconds > durationSeconds) {
                        durationSeconds = Math.max(durationSeconds, currentRes.lastTimestampSeconds + 60);
                    }

                    if (i === 0 || i % 8 === 0 || currentRes.count !== lastSegmentCount) {
                        const cov = durationSeconds > 0 ? ((currentRes.lastTimestampSeconds / durationSeconds) * 100).toFixed(1) + '%' : 'N/A';
                        this.sendLog('Polling', {
                            iteration: `${i + 1}/120`,
                            segments: currentRes.count,
                            range: `${currentRes.firstTimestamp} -> ${currentRes.lastTimestamp}`,
                            lastSec: currentRes.lastTimestampSeconds,
                            durationSeconds,
                            coverage: cov,
                            unchangedRounds
                        });
                    }

                    if (i >= 1 && durationSeconds > 60 && currentRes.lastTimestampSeconds >= Math.max(30, durationSeconds - 120)) {
                        this.sendLog('ResolvedComplete', {
                            reason: 'Reached video end (>= duration - 120s)',
                            segments: currentRes.count,
                            range: `${currentRes.firstTimestamp} -> ${currentRes.lastTimestamp}`,
                            durationSeconds
                        });
                        return currentRes;
                    }

                    if (currentRes.count === lastSegmentCount) {
                        unchangedRounds++;
                    } else {
                        unchangedRounds = 0;
                        lastSegmentCount = currentRes.count;
                    }
                } else if (i % 8 === 0) {
                    this.sendLog('PollingNoSegments', { iteration: `${i + 1}/120`, durationSeconds });
                }

                if (bestResult && durationSeconds > 60 && bestResult.lastTimestampSeconds >= durationSeconds * 0.85 && unchangedRounds >= 16) {
                    this.sendLog('ResolvedCoverage', {
                        reason: 'Reached >= 85% coverage and stabilized',
                        segments: bestResult.count,
                        range: `${bestResult.firstTimestamp} -> ${bestResult.lastTimestamp}`,
                        durationSeconds
                    });
                    return bestResult;
                }
            }

            this.sendLog('ResolvedTimeout', {
                reason: 'Reached 120 polling iterations (30s limit)',
                segments: bestResult?.count || 0,
                range: bestResult ? `${bestResult.firstTimestamp} -> ${bestResult.lastTimestamp}` : 'None',
                durationSeconds
            });
            return bestResult;
        } catch (err) {
            this.sendLog('ExtractionError', { error: String(err), stack: err?.stack });
            console.warn('Transcript extraction error:', err);
        }

        return null;
    },

    extract() {
        if (window._youtubeExtractionActive || this._isExtracting) return;
        window._youtubeExtractionActive = true;
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

        const getTitle = () => {
            const selectors = [
                'ytd-watch-metadata #title h1',
                '#title h1',
                'h1.ytd-watch-metadata',
                'h1.title.ytd-video-primary-info-renderer',
                '#title',
                'ytd-watch-metadata #title'
            ];
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el && el.textContent && el.textContent.trim()) {
                    return el.textContent.trim();
                }
            }
            if (document.title && !document.title.startsWith('http')) {
                const clean = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
                if (clean) return clean;
            }
            return 'N/A';
        };

        const getChannel = () => {
            const selectors = [
                '#owner #channel-name #text',
                '#channel-name #text',
                'ytd-channel-name #text',
                'ytd-video-owner-renderer #channel-name a',
                '#upload-info #channel-name'
            ];
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el && el.textContent && el.textContent.trim()) {
                    return el.textContent.trim();
                }
            }
            return 'N/A';
        };

        const getVideoInfo = () => {
            const infoText = document.querySelector('ytd-watch-info-text #info, ytd-watch-metadata #info');
            return infoText ? infoText.textContent.trim() : 'N/A';
        };

        const getDescription = () => {
            const selectors = [
                '#description-inline-expander',
                'ytd-watch-metadata #description-inline-expander',
                'ytd-text-inline-expander#description-inline-expander',
                'ytd-text-inline-expander#description-inline-expander yt-attributed-string',
                'ytd-text-inline-expander#description-inline-expander yt-formatted-string',
                '#description yt-attributed-string',
                '#description yt-formatted-string',
                '#description'
            ];
            let node = null;
            for (const s of selectors) {
                node = document.querySelector(s);
                if (node && (node.innerText || node.textContent || '').trim()) break;
            }
            if (!node) return { text: 'N/A', links: [] };
            const raw = (node.innerText || node.textContent || '').trim();
            if (!raw) return { text: 'N/A', links: [] };
            let text = raw.replace(/\n{3,}/g, '\n\n').trim();
            const links = Array.from(node.querySelectorAll('a'))
                .map(a => ({ href: a.href, text: (a.innerText || a.textContent || '').trim() }))
                .filter(l => l.href && l.href.startsWith('http'));
            return { text, links };
        };

        (async () => {
            try {
                // Ensure page metadata and description components are fully mounted before extracting
                await waitForElement('#title h1, h1.ytd-watch-metadata, #description-inline-expander, ytd-watch-metadata, #description', 10000);
                await new Promise(r => setTimeout(r, 600));

                const videoTitle = getTitle();
                const channelName = getChannel();

                const durationSeconds = this.getDurationInSeconds();
                const videoDuration = this.getVideoDurationFormatted(durationSeconds);
                const info = getVideoInfo();
                const videoUrl = window.location.href;

                const descResult = getDescription();
                const descriptionText = descResult.text;
                const descriptionLinks = descResult.links;

                // 1. Pure UI Click & Copy transcript extraction
                const transcriptResult = await this.getTranscript();

                let transcriptText = '';
                let transcriptStatus = '';
                let warningBanner = '';

                if (!transcriptResult || !transcriptResult.text || transcriptResult.count < 2) {
                    transcriptStatus = '⚠️ Unavailable';
                    transcriptText = `Transcript could not be extracted directly (captions may be disabled, unservable, or processing). Please use the video URL and detailed description/chapters above to analyze the content: ${videoUrl}`;
                    warningBanner = `> [!WARNING]
> **Transcript Unavailable**: A full transcript could not be extracted for this video (captions may be disabled, unservable, or still processing on YouTube). The summary must rely primarily on the video title, description, chapters, and external URLs.`;
                } else {
                    transcriptText = transcriptResult.text;
                    const lastSec = transcriptResult.lastTimestampSeconds;
                    const lastTs = transcriptResult.lastTimestamp;
                    const firstTs = transcriptResult.firstTimestamp;

                    // Evaluate whether transcript is genuinely incomplete
                    // (e.g., missing > 20% and > 2 minutes, or missing > 5 minutes for long videos)
                    let isSubstantiallyIncomplete = false;
                    let coveragePercent = 100;

                    if (durationSeconds > 60 && lastSec > 0) {
                        const remainingSeconds = durationSeconds - lastSec;
                        const coverageRatio = lastSec / durationSeconds;
                        coveragePercent = Math.min(100, Math.round(coverageRatio * 100));

                        if ((coverageRatio < 0.80 && remainingSeconds > 120) || (remainingSeconds > 300 && durationSeconds > 1800)) {
                            isSubstantiallyIncomplete = true;
                        }
                    }

                    if (isSubstantiallyIncomplete) {
                        transcriptStatus = `⚠️ Incomplete (Coverage: ${firstTs} - ${lastTs} | ~${coveragePercent}% of ${videoDuration})`;
                        warningBanner = `> [!WARNING]
> **Transcript Incomplete**: The video duration is ${videoDuration}, but the extracted transcript only covers up to ${lastTs} (~${coveragePercent}% of the video). Portions of the video after ${lastTs} are not included in the transcript. Please summarize the transcribed portion in detail and synthesize remaining sections from the description/chapters while noting this limitation.`;
                    } else {
                        transcriptStatus = '✓ Complete';
                        warningBanner = '';
                    }
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
                const warningBlock = warningBanner ? `\n\n${warningBanner}\n` : '';

                let fullText = `${prompt}
${metadataText}${warningBlock}
${footnotesText}

Here is the description:
<description>
${descriptionText}
</description>

Here is the transcript:
<transcript>
${transcriptText}
</transcript>`;

                let contentOnlyText = `${metadataText}${warningBlock}
${footnotesText}

Here is the description:
<description>
${descriptionText}
</description>

Here is the transcript:
<transcript>
${transcriptText}
</transcript>`.trim();

                this.sendLog('DispatchExtractedText', {
                    videoTitle,
                    videoDuration,
                    transcriptStatus,
                    hasWarning: !!warningBanner,
                    transcriptChars: transcriptText.length,
                    totalChars: fullText.length
                });

                chrome.runtime.sendMessage({
                    type: 'extractedText',
                    text: fullText,
                    contentOnly: contentOnlyText,
                    contentType: 'youtube',
                    videoTitle: videoTitle,
                    videoChannel: channelName,
                    videoUrl: videoUrl,
                    videoDuration: videoDuration,
                    transcriptStatus: transcriptStatus,
                    hasWarning: !!warningBanner,
                    info: info,
                    videoDescription: descriptionText,
                    videoDescriptionLinks: descriptionLinks,
                    transcriptText: transcriptText
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
                window._youtubeExtractionActive = false;
            }
        })();
    }
};

// Self-contained button injector for video cards across YouTube (Home, Feeds, Search)
(function () {
    if (window.top !== window.self) return;

    // Clean up any stale buttons or intervals from an earlier extension reload
    if (window.__ytAiSummarizeInterval__) {
        clearInterval(window.__ytAiSummarizeInterval__);
    }
    const oldStyle = document.getElementById('__yt_ai_summarize_styles__');
    if (oldStyle) oldStyle.remove();
    document.querySelectorAll('.yt-ai-summarize-badge').forEach((el) => el.remove());
    document.querySelectorAll('[data-ai-btn]').forEach((el) => delete el.dataset.aiBtn);

    function ensureStyles() {
        if (document.getElementById('__yt_ai_summarize_styles__')) return;
        const style = document.createElement('style');
        style.id = '__yt_ai_summarize_styles__';
        style.textContent = `
            .yt-ai-summarize-badge {
                position: absolute !important;
                top: 8px !important;
                left: 8px !important;
                z-index: 200 !important;
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

            /* Show button on hover of the video card or thumbnail */
            yt-lockup-view-model:hover .yt-ai-summarize-badge,
            ytd-rich-item-renderer:hover .yt-ai-summarize-badge,
            ytd-video-renderer:hover .yt-ai-summarize-badge,
            ytd-grid-video-renderer:hover .yt-ai-summarize-badge,
            ytd-compact-video-renderer:hover .yt-ai-summarize-badge,
            .yt-lockup-view-model__content-image:hover .yt-ai-summarize-badge,
            .yt-lockup-view-model-wiz__content-image:hover .yt-ai-summarize-badge,
            yt-thumbnail-view-model:hover .yt-ai-summarize-badge,
            ytd-thumbnail:hover .yt-ai-summarize-badge,
            #thumbnail:hover .yt-ai-summarize-badge {
                opacity: 0.95 !important;
                visibility: visible !important;
                pointer-events: auto !important;
                transform: scale(1) !important;
            }

            .yt-ai-summarize-badge:hover,
            .yt-ai-summarize-badge:focus-visible {
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: auto !important;
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
        // (do not filter by :not([data-ai-btn]) because YouTube recycles card DOM on scroll/navigation)
        const cards = document.querySelectorAll(
            'ytd-rich-item-renderer, ' +
            'ytd-video-renderer, ' +
            'ytd-grid-video-renderer, ' +
            'ytd-compact-video-renderer, ' +
            'yt-lockup-view-model'
        );

        cards.forEach((card) => {
            // If this is an inner yt-lockup-view-model inside a ytd-rich-item-renderer, let the outer card own the single badge
            if (card.tagName.toLowerCase() === 'yt-lockup-view-model' && card.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer')) {
                return;
            }

            // Find watch link with valid video ID
            const link = card.querySelector(
                'a[href*="/watch?v="], ' +
                'a[href*="watch?v="], ' +
                'a.yt-lockup-view-model__content-image, ' +
                'a.yt-lockup-view-model-wiz__content-image, ' +
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

            // If badge already exists on this card, keep its videoId up-to-date for recycled DOM nodes
            const existingBtn = card.querySelector('.yt-ai-summarize-badge');
            if (existingBtn) {
                existingBtn.dataset.videoId = videoId;
                return;
            }

            // Find the best thumbnail container to host the top-left overlay badge
            const thumb = card.querySelector(
                '.yt-lockup-view-model__content-image, ' +
                '.yt-lockup-view-model-wiz__content-image, ' +
                '.ytLockupViewModelContentImage, ' +
                'yt-thumbnail-view-model, ' +
                'ytd-thumbnail, ' +
                '#thumbnail, ' +
                'a#thumbnail'
            ) || card;

            // Resolve hostContainer outside of any anchor or aria-hidden elements to satisfy WAI-ARIA and HTML specs
            let hostContainer = thumb;
            while (hostContainer && (hostContainer.tagName === 'A' || hostContainer.getAttribute('aria-hidden') === 'true' || hostContainer.closest('[aria-hidden="true"]'))) {
                const parent = hostContainer.parentElement;
                if (!parent || hostContainer === card) break;
                hostContainer = parent;
            }
            if (!hostContainer) hostContainer = card;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'yt-ai-summarize-badge';
            btn.title = 'Summarize with AI';
            btn.setAttribute('aria-label', 'Summarize with AI');
            btn.dataset.videoId = videoId;

            const { sparkleSvg, spinnerSvg } = createSvgIcons();
            btn.appendChild(sparkleSvg);
            btn.appendChild(spinnerSvg);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.classList.contains('is-loading')) return;
                btn.classList.add('is-loading');

                const currentVideoId = btn.dataset.videoId || videoId;
                const titleEl = card.querySelector('a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title, #video-title, h3');
                const videoTitle = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
                const targetUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
                const payload = {
                    type: 'summarizeYouTubeFromHome',
                    videoUrl: targetUrl,
                    videoId: currentVideoId,
                    videoTitle: videoTitle
                };

                const done = () => btn.classList.remove('is-loading');
                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage(payload, done);
                } else if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
                    browser.runtime.sendMessage(payload).finally(done);
                }

                // Automatic safety reset after 6 seconds
                setTimeout(done, 6000);
            });

            const computedStyle = window.getComputedStyle(hostContainer);
            if (computedStyle.position === 'static') {
                hostContainer.style.position = 'relative';
            }
            if (computedStyle.display === 'inline') {
                hostContainer.style.display = 'block';
            }
            hostContainer.appendChild(btn);
        });
    }

    function checkAutoExtract() {
        if (!window.location.href.includes('/watch') && !window.location.href.includes('v=')) return;
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ type: 'checkPendingAction' }, async (response) => {
                    if (typeof chrome !== 'undefined' && chrome.runtime?.lastError) return;
                    if (response && response.shouldExtract) {
                        // Wait for watch page player, metadata, and description to initialize
                        for (let t = 0; t < 25; t++) {
                            const duration = window.youtubeExtractor?.getDurationInSeconds() || 0;
                            const hasDesc = !!document.querySelector('#description, ytd-watch-metadata, #description-inline-expander');
                            if (duration > 0 && hasDesc) {
                                break;
                            }
                            await new Promise(r => setTimeout(r, 200));
                        }

                        if (window.youtubeExtractor?.extract) {
                            window.youtubeExtractor.extract();
                        }
                    }
                });
            }
        } catch (e) {}
    }

    injectCardButtons();
    window.__ytAiSummarizeInterval__ = setInterval(injectCardButtons, 1000);
    checkAutoExtract();
    window.addEventListener('yt-navigate-finish', () => {
        setTimeout(injectCardButtons, 500);
        setTimeout(checkAutoExtract, 500);
    });
})();