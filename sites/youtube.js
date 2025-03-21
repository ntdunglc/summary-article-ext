window.youtubeExtractor = {
    getPrompt() {
        return `Your output should use the following template, based on the video transcript, title, channel, and URL:

  ### Video Metadata
  **Title:** [YouTube Video Title]
  **Channel:** [YouTube Channel Name]
  **URL:** [YouTube Video URL]
  **Duration:** [Duration] | **Publication Date:** [Publication Date] | **Views:** [Views]

  ### Summary
  A detailed 1-2 paragraph overview of the video's content, main arguments, and significance. Include the context of why this topic matters and what viewers will learn.

  ### Key points
  - Few bullet points covering major themes and arguments
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
  - Provide coverage proportional to the section's length in the original.
  - Quote important statements verbatim to preserve key insights
  - Explain complex concepts as they arise
  - Connect ideas to earlier or later parts of the video
  - Note real-world applications or examples given
  - Preserve the speaker's original organization and progression of ideas
  - Match section breaks to natural transition points in the video
  - Each section should not take longer to read than the actual video time.
  - Skip sponsor sections.

  ### Highlights: Novel Insights, Funny Moments, and Conventional Takes

  - **Novel Insights:**
    - Bullet points highlighting original ideas or unique perspectives presented in the video.
    - Focus on takeaways that are new, surprising, or thought-provoking.

  - **Funny Moments:**
    - Bullet points describing any instances of humor, jokes, or lighthearted segments.
    - Note what makes these moments funny in the context of the video.

  - **Conventional Takes:**
    - Bullet points outlining ideas or viewpoints that are widely accepted or already commonly known within the discussed topic.
    - Identify elements that reinforce existing knowledge or represent standard perspectives.

  ALWAYS skip sponsor sections.
  The template looks like markdown, but don't quote your markdown.

  Here is the transcript:`;
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
            if (!infoText) return { views: 'N/A', publishDate: 'N/A' };

            // Extract all text spans
            const spans = Array.from(infoText.querySelectorAll('span.style-scope.yt-formatted-string'));
            return spans.reduce((info, span) => {
                const text = span.textContent.trim();
                if (text.includes('views')) info.views = text;
                else if (text.includes('ago')) info.publishDate = text;
                return info;
            }, { views: 'N/A', publishDate: 'N/A' });
        };

        (async () => {
            try {
                // Extract Video Title
                const titleElement = document.querySelector('#title');
                const videoTitle = titleElement ? titleElement.textContent.trim() : 'N/A';

                // Extract Channel Name
                const channelElement = document.querySelector('#channel-name #text');
                const channelName = channelElement ? channelElement.textContent.trim() : 'N/A';

                // Extract Video URL
                const videoUrl = window.location.href;

                // Extract Video Duration
                const videoDuration = getVideoDuration();

                // Extract additional info
                const { views, publishDate } = getVideoInfo();

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

                let metadataText = `### Video Metadata
**Title:** ${videoTitle}
**Channel:** ${channelName}
**URL:** ${videoUrl}
**Info:** ${videoDuration} • ${views} • ${publishDate}`;

                let fullText = this.getPrompt() + '\n\n' + metadataText + '\n\n' + 'Here is the transcript:\n\n' + transcriptText;

                chrome.runtime.sendMessage({
                    type: 'extractedText',
                    text: fullText,
                    contentType: 'youtube',
                    videoTitle: videoTitle,
                    videoChannel: channelName,
                    videoUrl: videoUrl,
                    videoDuration: videoDuration,
                    videoViews: views,
                    publishDate: publishDate
                });

            } catch (error) {
                console.error('Failed to extract transcript and video info:', error);
                chrome.runtime.sendMessage({
                    type: 'extractionError',
                    error: 'Failed to extract transcript and video info',
                    details: error.message
                });
            }
        })();
    }
};