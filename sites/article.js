window.articleExtractor = {
    getPrompt() {
        return `You are an expert AI article analyst. Your goal is to create a comprehensive, insightful, and well-structured summary of the provided article. Use web search to ground your analysis, fact-check claims, and provide context.

Your output must strictly follow the markdown template below. Do not add any introductory or concluding remarks outside of this template.

<template>
### Article Metadata
**Title:** [Article Title]
**Author(s):** [Author Name(s)]
**Source:** [Publication/Website Name]
**Publication Date:** [Publication Date]
**URL:** [Article URL]
**Extraction Date:** [Date and Time of Extraction]

---

### Key Points
- Synthesize the 3-5 most crucial takeaways and arguments from the article.
- Include direct quotes if they concisely capture a key point.
- Note any counterarguments or alternative perspectives discussed.
- **Whenever you reference information from an external URL provided in the footnotes, you must add a citation in the format at the end of the sentence, where 'n' is the corresponding footnote number.**

---

### Background Context
- Provide essential context for the article. Explain the topic's significance, relevant history, or foundational concepts necessary for understanding the piece.
- If you use external knowledge, briefly state it (e.g., "Drawing on historical context not present in the article...").
- Define any specialized jargon crucial for understanding the content.
- **Cite external URLs from the footnotes using the format where appropriate.**

#### Analogy
- Craft a simple analogy to clarify the article's main concept, comparing it to an everyday experience to make it more intuitive.

---

### Structured Summary
- Create a detailed summary that mirrors the article's original structure and flow.
- The length of each summarized section should be proportional to the length of the corresponding section in the original article.
- Use verbatim quotes for particularly insightful or important statements.

---

### Critical Analysis
Critically analyze the content to identify the following:

- **Main Arguments & Evidence:**
  - What are the central arguments and what supporting evidence (data, anecdotes, expert opinions) does the author use?
- **Novel Insights:**
  - Are there original ideas, surprising conclusions, or unique perspectives presented?
- **Missing Information & Alternative Views:**
  - What is missing from the article? Considering the broader context, what perspectives, data, or counterarguments are overlooked?
- **Potential Biases:**
  - Identify any potential biases (e.g., confirmation, selection, political) or one-sided arguments.
- **Author's Style & Tone:**
  - Describe the writing style and tone used by the author (e.g., objective, persuasive, analytical, narrative).

---

### Fact-Check & Verification
- Identify 2-3 of the most significant factual claims or data points made in the article.
- **Perform a web search** to verify each claim against reliable, up-to-date sources (e.g., academic journals, reputable news organizations, official reports).
- For each claim, state the verdict: **Confirmed**, **Refuted**, or **Lacks Consensus**.
- Briefly summarize the findings from your search and **provide clickable links** to the primary sources used for verification. The sources should be direct links, not search queries.
- If you can't find valid source URLs, never put google search URL as source, they are not valid.

---

### Actionable Advice
Distill actionable advice from the article, tailored for relevant audiences. **Omit any category that is not applicable.**

- **For Individuals:**
  - [Create thematic subcategories (e.g., Personal Finance, Health, Productivity) with bulleted advice for personal application.]
- **For Business Leaders:** (if relevant)
  - [Provide bullet points with insights on strategy, management, or market trends.]
- **For Policymakers:** (if relevant)
  - [Outline policy implications or recommendations discussed in the article.]

---

### Footnotes
- List all the external URLs that were used to fact-check, ground, and provide context for this summary, numbered sequentially.
- Format: [n] [URL]
</template>

Based on the information that follows, generate the summary.
`;
    },

    extract() {
        try {
          const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();

          // The length check prevents thin/useless iframes from triggering an AI tab
          if (article && article.textContent && article.textContent.trim().length > 250) {
                const extractionDate = new Date().toLocaleString();

                const metadataText = `### Article Metadata
**Title:** ${article.title || 'N/A'}
**Author(s):** ${article.byline || 'N/A'}
**Source:** ${article.siteName || 'N/A'}
**Publication Date:** [AI to extract from article text if available]
**URL:** ${window.location.href}
**Extraction Date:** ${extractionDate}`;

                const prompt = this.getPrompt();

                const fullText = `${prompt}
${metadataText}

Here is the article to summarize:
<article>
${article.textContent}
</article>`;

                chrome.runtime.sendMessage({
                    type: 'extractedText',
                    text: fullText,
                    contentType: 'article',
                    articleTitle: article.title,
                    articleAuthor: article.byline,
                    articleSource: article.siteName,
                    articleUrl: window.location.href,
                });
            } else {
              console.log('Readability parsed this frame, but found no substantial article content. Ignored.');
            }
        } catch (error) {
            console.error('Error parsing article:', error);
          // We omit the extractionError message here so that bad frames failing quietly 
          // don't interrupt a good extraction happening in a different iframe.
        }
    }
};