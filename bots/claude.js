window.claudeBot = {
    async waitForElement(selector, maxAttempts = 20, delay = 500) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) { return element; }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    async waitForSendButton(maxAttempts = 15, delay = 200) {
        const getButton = () => {
            return document.querySelector('button[aria-label*="Send" i]') ||
                   document.querySelector('button[aria-label*="Message" i]') ||
                   document.querySelector('button.bg-accent-main-100') ||
                   Array.from(document.querySelectorAll('button')).find(btn => {
                       const label = btn.getAttribute('aria-label');
                       return label && (label.toLowerCase().includes('send') || label.toLowerCase().includes('message'));
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
        console.log('claudeBot: input started');
        
        // 1. Try to find the prompt field (supports new textarea and old contenteditable layouts)
        const textareaSelector = 'textarea[aria-label*="message" i], textarea[placeholder*="message" i], textarea';
        let promptField = document.querySelector(textareaSelector);
        
        if (promptField) {
            console.log('claudeBot: Found textarea prompt field:', promptField);
            promptField.value = text;
            promptField.focus();
            
            // Dispatch input/change events to notify React state handlers
            promptField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            promptField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else {
            // Fallback: Check for contenteditable divs
            const contentEditables = document.querySelectorAll('[contenteditable="true"]');
            if (contentEditables && contentEditables.length > 0) {
                promptField = contentEditables[0];
                console.log('claudeBot: Found contenteditable prompt field:', promptField);
                
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

                promptField.innerHTML = formattedHtml;
                promptField.focus();
                promptField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
        }

        if (!promptField) {
            console.error('claudeBot: No prompt textarea or contenteditable found.');
            return;
        }

        // 2. Wait for the send button to become enabled and click it
        console.log('claudeBot: Waiting for enabled send button...');
        const sendButton = await this.waitForSendButton(20, 200);
        
        if (sendButton) {
            const isDisabled = sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true' || sendButton.classList.contains('disabled');
            if (!isDisabled) {
                console.log('claudeBot: Clicking enabled send button:', sendButton);
                sendButton.click();
            } else {
                console.warn('claudeBot: Send button found but it is disabled.');
            }
        } else {
            console.error('claudeBot: Send button not found or remained disabled.');
        }
    }
};