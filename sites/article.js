window.articleExtractor = {
    getPrompt() {
        return `Please read the article provided and create a concise, proportionate overview. Structure your response with these sections:

1.  **Metadata**
    *   Title:
    *   Source:
    *   Author:
    *   Published:
    *   URL:

2.  **Key Points**
    *   The most important takeaways from the article. *Include relevant quotes if they concisely capture a key point.*

3.  **Background**
    *   Relevant historical or thematic information providing context for the article.

4.  **Structured Summary**
    *   A summary of the article that mirrors its original structure. The length of each summarized section should be proportional to the length of the corresponding section in the original article. The overall length of this summary should also reflect the overall length of the original article.  *Include relevant quotes where they effectively illustrate a point or argument.*

5.  **Analysis & Implications**
    *   Main arguments and supporting evidence presented in the article. *Include relevant quotes to support the analysis.*
    *   Potential biases or limitations of the article.
    *   The writing style and tone used by the author.
    *   The broader significance, impact, or consequences related to the article's content.
    *   **Novel Insights:** Any original observations, connections to other works, or critical perspectives that go beyond the explicit content of the article.

The template looks like markdown, but don't output markdown directly.
**Here is the article:**`;
    },

    extract() {
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

                const fullText = this.getPrompt() + '\n\n' + contextInfo + article.textContent;

                chrome.runtime.sendMessage({
                    type: 'extractedText',
                    text: fullText,
                    contentType: 'article'
                });
            }
        } catch (error) {
            console.error('Error parsing article:', error);
        }
    }
};