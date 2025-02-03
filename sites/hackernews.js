window.hackernewsExtractor = {
    getPrompt() {
        return `Please analyze this Hacker News discussion thread and create a structured summary in the following format:
  ### Main Topic
  - Title of the post
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
  
  Here is the discussion:`;
    },

    extract() {
        const title = document.querySelector('.titleline')?.innerText || '';
        const points = document.querySelector('.score')?.innerText || '0 points';
        const mainPost = {
            title,
            points,
            url: document.querySelector('.titleline a')?.href || '',
            content: ''
        };

        const comments = [];
        document.querySelectorAll('.comtr').forEach(comment => {
            const indent = parseInt(comment.querySelector('.ind img')?.width || '0');
            const level = indent / 40;

            const username = comment.querySelector('.hnuser')?.innerText || '';
            const text = comment.querySelector('.commtext')?.innerText || '';
            const points = comment.querySelector('.score')?.innerText || '';
            const age = comment.querySelector('.age')?.innerText || '';

            comments.push({
                level,
                username,
                text,
                points,
                age
            });
        });

        let formattedDiscussion = `${mainPost.title}\n${mainPost.points}\n${mainPost.url}\n\n`;

        comments.forEach(comment => {
            const indent = '\u00A0\u00A0'.repeat(comment.level);
            formattedDiscussion += `${indent}@${comment.username} ${comment.points} ${comment.age}\n`;
            formattedDiscussion += comment.text.split('\n')
                .map(line => `${indent}${line}`)
                .join('\n');
            formattedDiscussion += '\n\n';
        });

        const fullText = this.getPrompt() + '\n\n' + formattedDiscussion;

        chrome.runtime.sendMessage({
            type: 'extractedText',
            text: fullText,
            contentType: 'hn'
        });
    }
};