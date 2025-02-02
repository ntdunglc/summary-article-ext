window.claudeBot = {
    input(text) {
        const textareas = document.querySelectorAll('[contenteditable="true"]');
        if (textareas && textareas.length > 0) {
            const textarea = textareas[0];
            const formattedHtml = text
                .split('\n')
                .map(line => {
                    if (line.trim() === '') {
                        return '<div><br></div>';
                    }
                    const leadingSpaces = line.match(/^\s*/)[0].length;
                    const spacedLine = '\u00A0'.repeat(leadingSpaces) + line.trimLeft();
                    return `<div>${spacedLine}</div>`;
                })
                .join('');

            textarea.innerHTML = formattedHtml;

            setTimeout(() => {
                const sendButton = document.querySelector('button[aria-label="Send Message"]') ||
                    document.querySelector('button.bg-accent-main-100');
                if (sendButton) sendButton.click();
            }, 1000);
        }
    }
};