window.hackernewsExtractor = {
    /**
     * Creates a prompt that instructs the AI to fetch and analyze the article
     * using its own browsing tools.
     */
    getPrompt() {
        return `You are an expert AI analyst. Your task is to provide a comprehensive analysis of an online article and its corresponding Hacker News discussion thread.

**Using your browsing tool, you must first access and read the content from the 'Original Article URL' provided in the data block below.**

**If you are unable to access the 'Original Article URL' for any reason, you must skip the article analysis in Part 1.** Instead, write "### PART 1: ARTICLE ANALYSIS - FAILED TO RETRIEVE" on a new line, followed by the original URL on the next line. Then, proceed directly to Part 2.

After reading the article, proceed to analyze both the article and the provided Hacker News discussion. Your final output must be a single response, strictly following the two-part template structure outlined below.

--- START OF TEMPLATE ---

### PART 1: ARTICLE ANALYSIS

#### Article Metadata
**Title:** [Extract from the article you browsed]
**Author(s):** [Extract from the article you browsed]
**Source:** [Extract from the article you browsed]
**Publication Date:** [Extract from the article you browsed]
**URL:** [The Original Article URL provided below]
**Extraction Date:** [Date and Time of Extraction, provided below]

#### Key Points
- Synthesize the 3-5 most crucial takeaways and arguments from the article.
- Include direct quotes if they concisely capture a key point.

#### Structured Summary
- Create a detailed summary that mirrors the article's original structure and flow.
- Use verbatim quotes for particularly insightful or important statements.

#### Critical Analysis
- **Main Arguments & Evidence:** What are the central arguments and what supporting evidence does the author use?
- **Novel Insights:** Are there original ideas or unique perspectives presented?
- **Missing Information & Alternative Views:** What perspectives, data, or counterarguments are overlooked?
- **Potential Biases:** Identify any potential biases (e.g., confirmation, selection, political).

---

### PART 2: HACKER NEWS DISCUSSION ANALYSIS

#### Main Topic of Discussion
- **Title of the post:** [Post Title from the provided data]
- **Hacker News URL:** [HN Discussion URL from the provided data]
- **Author, points, and comment count:** [HN post metadata from the provided data]
- **Key context from the article/post that sparked the discussion:** [Based on your reading of the article and the discussion, briefly describe what ignited the conversation]

#### Major Discussion Threads
For each significant discussion branch (>10 upvotes or significant discussion depth):

##### {Thread headline}
- **Main argument/point being discussed:**
- **Key perspectives (with usernames in bold):**
> Notable quotes that capture the essence of the discussion
- **How the discussion evolved/branched:**

#### Notable Insights from the Discussion
- Unique perspectives or particularly insightful comments.
- Industry experience or historical context shared by commenters.
- Practical suggestions or solutions proposed in the thread.

--- END OF TEMPLATE ---

Analyze the following data to generate your response.
`;
    },

    /**
     * Extracts HN data and formats it for the AI to analyze.
     * The AI is responsible for fetching and reading the original article.
     */
    extract() {
        // --- 1. Extract Hacker News Post Details ---
        const hnTitle = document.querySelector('.titleline')?.innerText || '';
        const articleUrl = document.querySelector('.titleline a')?.href || '';
        const points = document.querySelector('.score')?.innerText || '0 points';
        const author = document.querySelector('.subtext .hnuser')?.innerText || '';
        const age = document.querySelector('.age')?.innerText || '';
        const commentCount = document.querySelector('.subtext a:last-child')?.innerText || '0 comments';
        const hnUrl = window.location.href;
        const extractionDate = new Date().toLocaleString();

        // --- 2. Format the Hacker News Data for the Prompt ---
        let providedData = `
--- START OF PROVIDED DATA ---

### Article & Page Metadata
- **Original Article URL:** ${articleUrl}
- **Hacker News URL:** ${hnUrl}
- **Extraction Date:** ${extractionDate}

### Hacker News Post Details
- **Title:** ${hnTitle}
- **Author:** ${author}
- **Points:** ${points}
- **Age:** ${age}
- **Comment Count:** ${commentCount}

### Hacker News Discussion
`;
        document.querySelectorAll('.comtr').forEach(comment => {
            const indent = parseInt(comment.querySelector('.ind img')?.width || '0');
            const level = indent / 40;
            const username = comment.querySelector('.hnuser')?.innerText || '';
            const text = comment.querySelector('.commtext')?.innerText || '';
            const commentAge = comment.querySelector('.age')?.innerText || '';

            if (text && username) {
                const indentStr = '  '.repeat(level);
                providedData += `${indentStr}@${username} ${commentAge}\n`;
                text.split('\n').forEach(line => {
                    if (line.trim().length > 0) {
                        providedData += `${indentStr}${line.trim()}\n`;
                    }
                });
                providedData += '\n';
            }
        });

        providedData += "\n--- END OF PROVIDED DATA ---";

        // --- 3. Assemble the Final Output ---
        const fullText = `${this.getPrompt()}\n\n${providedData}`;

        // Send message if in extension context
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'extractedText',
                text: fullText,
                contentType: 'hn_and_article_url'
            });
        }

        return fullText;
    }
};