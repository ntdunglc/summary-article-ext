window.leetcodeExtractor = {
    getPrompt() {
        return `Please analyze the following LeetCode problem and provide structured summary in the below format:

### Problem Overview
- Problem Title
- Original Problem Description
- Explain Problem Description (in your own words, concise and clear)
- Problem Category (e.g., Array, String, Dynamic Programming)
- Difficulty Level (Easy, Medium, Hard)

### Examples
- Summarize the key examples provided, highlighting input and expected output and any noteworthy characteristics of the example.

### Constraints
- List and briefly explain the constraints (e.g., size of input array, range of values).

### Key Concepts & Approaches
- Identify the primary concepts or algorithms relevant to solving this problem.
- Suggest potential approaches or data structures that could be used.

### Questions to Consider
- What are some edge cases to consider?
- Are there any potential performance bottlenecks?
- How can the problem be broken down into smaller subproblems?

### Implementation
- Start with the code skeleton and complete the efficient implementation.

### Self Evaluation
- Provide the time and space complexity of your solution.
- A few points of future improvements.

Code skeleton:

`;
    },

    extract() {
        try {
            // Existing selectors
            const titleElement = document.querySelector('.text-title-large');
            const descriptionElement = document.querySelector('.elfjS');
            const difficultyElement = document.querySelector('.relative.inline-flex.items-center.justify-center.text-caption');
            const topicTags = Array.from(document.querySelectorAll('a[class*="no-underline hover:text-current relative inline-flex"]'))
                .map(tag => tag.textContent)
                .join(', ');
            const exampleElements = document.querySelectorAll('pre');
            const constraintsElement = document.querySelector('ul');

            // New selector for code skeleton
            const codeElement = document.querySelector('.monaco-editor .view-lines');

            const title = titleElement ? titleElement.textContent.trim() : 'N/A';
            const description = descriptionElement ? descriptionElement.textContent.trim() : 'N/A';
            const difficulty = difficultyElement ? difficultyElement.textContent.trim() : 'N/A';

            let examplesText = '';
            exampleElements.forEach((example, index) => {
                examplesText += `Example ${index + 1}:\n${example.textContent.trim()}\n\n`;
            });

            const constraints = constraintsElement ?
                Array.from(constraintsElement.querySelectorAll('li'))
                    .map(li => li.textContent.trim())
                    .join('\n') :
                'N/A';

            // Extract code skeleton
            const codeSkeleton = codeElement ? codeElement.textContent.trim() : 'N/A';

            const problemInfo = {
                title,
                description,
                category: topicTags,
                difficulty,
                examples: examplesText,
                constraints,
            };

            const formattedInfo = Object.entries(problemInfo)
                .map(([key, value]) => {
                    if (!value || value === 'N/A') return null;
                    return `### ${key.charAt(0).toUpperCase() + key.slice(1)}\n${value}\n`;
                })
                .filter(Boolean)
                .join('\n');

            // Add code skeleton at the end
            const fullText = this.getPrompt() + '\n\n' + formattedInfo + '\n### Code Skeleton\n```python\n' + codeSkeleton + '\n```';

            chrome.runtime.sendMessage({
                type: 'extractedText',
                text: fullText,
                contentType: 'leetcode'
            });

        } catch (error) {
            console.error('Error extracting LeetCode problem info:', error);
            chrome.runtime.sendMessage({
                type: 'extractionError',
                error: 'Failed to extract LeetCode problem info',
                details: error.message
            });
        }
    }
};