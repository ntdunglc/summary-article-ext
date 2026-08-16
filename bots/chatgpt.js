window.chatgptBot = {
    async waitForElement(selector, maxAttempts = 30, delay = 300) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) { return element; }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    async waitForSendButton(maxAttempts = 20, delay = 250) {
        const getButton = () => {
            return document.querySelector('button[data-testid="send-button"]') ||
                   document.querySelector('button[aria-label*="Send" i]') ||
                   document.querySelector('button[aria-label="Send prompt"]');
        };

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const btn = getButton();
            if (btn) {
                const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');
                if (!isDisabled) {
                    return btn;
                }
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return getButton();
    },

    async input(text) {
        console.log('chatgptBot: input started');
        const selector = '#prompt-textarea, textarea[placeholder*="Ask"], textarea, [contenteditable="true"]';
        const textarea = await this.waitForElement(selector, 30, 300);

        if (!textarea) {
            console.error('chatgptBot: Prompt field not found after retries.');
            return;
        }

        if (textarea.tagName === 'TEXTAREA') {
            textarea.value = text;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else {
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
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }

        const sendButton = await this.waitForSendButton(25, 250);
        if (sendButton) {
            sendButton.click();
        } else {
            console.warn('chatgptBot: Send button not found or remained disabled.');
        }
    }
};