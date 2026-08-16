window.deepseekBot = {
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
            const sendBtn = document.querySelector('.ds-send-button') ||
                            document.querySelector('button[aria-label*="Send" i]') ||
                            document.querySelector('div[role="button"][aria-label*="Send" i]');
            if (sendBtn) return sendBtn;

            return Array.from(document.querySelectorAll('button, [role="button"]')).find(el => {
                const text = el.textContent?.trim();
                return text === 'DeepThink (R1)' || text === 'Search' || text === 'Send';
            });
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
        console.log('deepseekBot: input started');
        const selector = '#chat-input, textarea[placeholder*="Ask"], textarea, [contenteditable="true"]';
        const textarea = await this.waitForElement(selector, 30, 300);

        if (!textarea) {
            console.error('deepseekBot: Input field not found after retries.');
            return;
        }

        if (textarea.tagName === 'TEXTAREA') {
            textarea.value = text;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else {
            textarea.textContent = text;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }

        const sendButton = await this.waitForSendButton(25, 250);
        if (sendButton) {
            sendButton.click();
        } else {
            console.warn('deepseekBot: Send button not found or remained disabled.');
        }
    }
};