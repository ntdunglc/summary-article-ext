window.articleExtractor = {
    getPrompt() {
        return `Please read the article provided and create a concise, **proportionate** overview. Structure your response in with these sections:
  
  1. **Metadata**
    - Title:
    - Source:
    - Author:
    - Published:
    - URL:

  2. **Key Points**
     - The most important takeaways from the article.
  
  3. **Summary** *(proportional to length)*
     - Overview of main content and arguments.
  
  4. **Context & Background**
     - Relevant historical or thematic information.
  
  5. **Analysis**
     - Main arguments and evidence
     - Potential biases or limitations
     - Writing style and tone
  
  6. **Implications**
     - Broader significance or impact
  
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