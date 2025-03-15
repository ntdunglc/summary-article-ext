window.hackernewsExtractor = {
    getPrompt() {
        return `Please analyze this Hacker News discussion thread and create a structured summary in the following format:
  ### Main Topic
  - Title of the post
  - URL
  - Hackernews URL
  - Author, points, and comment count
  - Key context and what sparked the discussion
  
  ### Key Points
  - Summary for each key point
  ### Major Discussion Threads
  For each significant discussion branch (>10 upvotes or significant discussion depth):
  - Main argument/point being discussed
  - Key perspectives (with usernames)
  > Notable quotes that capture the essence of the discussion
  - How the discussion evolved/branched
  
  ### Notable Insights
  - Unique perspectives or particularly insightful comments
  - Industry experience or historical context shared
  - Practical suggestions or solutions proposed
  
  The template looks like markdown, but don't output markdown directly.
  Here is the discussion:`;
    },
    extract() {
        // Extract main post details
        const title = document.querySelector('.titleline')?.innerText || '';
        const url = document.querySelector('.titleline a')?.href || '';
        const domain = document.querySelector('.sitebit')?.innerText?.trim() || '';
        const points = document.querySelector('.score')?.innerText || '0 points';
        const author = document.querySelector('.subtext .hnuser')?.innerText || '';
        const age = document.querySelector('.age')?.innerText || '';
        const commentCount = document.querySelector('.subtext a:last-child')?.innerText || '0 comments';

        // Format main post section
        let formattedDiscussion = `HN Discussion URL: ${window.location.href}\n\n`;
        formattedDiscussion += `Title: ${title}\n`;
        formattedDiscussion += `URL: ${url}\n`;
        if (domain) formattedDiscussion += `Domain: ${domain}\n`;
        formattedDiscussion += `By: ${author} | ${points} | ${age} | ${commentCount}\n\n`;

        // Extract and format comments
        const comments = [];
        document.querySelectorAll('.comtr').forEach(comment => {
            const indent = parseInt(comment.querySelector('.ind img')?.width || '0');
            const level = indent / 40;
            const username = comment.querySelector('.hnuser')?.innerText || '';
            const text = comment.querySelector('.commtext')?.innerText || '';
            const commentAge = comment.querySelector('.age')?.innerText || '';
            const isDeleted = comment.querySelector('.commtext')?.classList.contains('cdd') || false;
            const isFlagged = text.includes('[flagged]');
            const hasChildren = comment.nextElementSibling?.querySelector('.ind img')?.width > indent;

            comments.push({
                level,
                username,
                text,
                age: commentAge,
                isDeleted,
                isFlagged,
                hasChildren
            });
        });

        // Format comments with proper indentation and structure
        comments.forEach(comment => {
            const indent = '  '.repeat(comment.level);
            const prefix = indent + '@' + comment.username + ' ' + comment.age;

            if (comment.isDeleted) {
                formattedDiscussion += `${prefix} [deleted]\n\n`;
                return;
            }

            if (comment.isFlagged) {
                formattedDiscussion += `${prefix} [flagged]\n`;
            } else {
                formattedDiscussion += `${prefix}\n`;
            }

            // Format comment text with proper indentation for each line
            const textLines = comment.text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            textLines.forEach(line => {
                formattedDiscussion += `${indent}${line}\n`;
            });

            // Add a visual separator if this comment has child comments
            if (comment.hasChildren) {
                formattedDiscussion += `${indent}|\n`;
            }

            formattedDiscussion += '\n';
        });

        const fullText = this.getPrompt() + '\n\n' + formattedDiscussion;

        // Send message if in extension context
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
                type: 'extractedText',
                text: fullText,
                contentType: 'hn'
            });
        }

        return fullText;
    }
};