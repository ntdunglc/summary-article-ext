window.geminiBot = {
    /**
     * Waits for an element matching the selector to appear in the DOM.
     * @param {string} selector - The CSS selector to wait for.
     * @param {number} [maxAttempts=20] - Maximum number of attempts.
     * @param {number} [delay=500] - Delay between attempts in milliseconds.
     * @returns {Promise<Element|null>} The found element or null if timeout.
     */
    async waitForElement(selector, maxAttempts = 20, delay = 500) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
            if (attempt === maxAttempts) {
                console.error(`Element not found after ${maxAttempts} attempts: "${selector}"`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    /**
     * Inputs text into the Gemini prompt box and clicks the Send button.
     * @param {string} text - The text to input into the prompt box.
     */
    async input(text) {
        // Selector for the content-editable div that serves as the input area in Gemini.
        const promptBoxSelector = 'div.ql-editor[data-placeholder="Ask Gemini"]';
        const promptBox = await this.waitForElement(promptBoxSelector);

        if (!promptBox) {
            console.error('Prompt box not found. Selector used:', promptBoxSelector);
            return;
        }

        console.log('Found prompt box, inputting text:', text);

        // For a content-editable div, we set its text content.
        // The <p> tag inside is where the text actually lives.
        const p_element = promptBox.querySelector('p');
        if (p_element) {
            p_element.textContent = text;
        } else {
            // Fallback if the p tag isn't there
            promptBox.textContent = text;
        }


        // Dispatch an 'input' event to let the web app know the content has changed.
        // This is crucial for enabling the send button.
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        promptBox.dispatchEvent(inputEvent);

        // A short delay to allow the UI to update and enable the send button.
        await new Promise(resolve => setTimeout(resolve, 200));

        // Selector for the send button, specifically when it's not disabled.
        const sendButtonSelector = 'button[aria-label="Send message"]:not([aria-disabled="true"])';
        const sendButton = await this.waitForElement(sendButtonSelector, 25, 300);

        if (sendButton) {
            console.log('Clicking enabled Send button.');
            sendButton.click();
        } else {
            console.error('Send button not found or not enabled. Selector used:', sendButtonSelector);
            const sendButtonMaybeDisabled = await this.waitForElement('button[aria-label="Send message"]', 1, 10);
            if (sendButtonMaybeDisabled) {
                console.warn('Send button was found, but it remained disabled.');
            }
        }
    }
};

// --- Example Usage ---
// To use this, open the developer console on gemini.google.com/app,
// paste the entire script above, and then run the example below.

/*
setTimeout(() => {
    window.geminiBot.input("Write a short poem about a robot discovering music.");
}, 3000); // 3-second delay to give you time to see it work.
*/