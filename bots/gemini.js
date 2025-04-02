window.geminiBot = {
    async waitForElement(selector, maxAttempts = 10, delay = 1000) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    async input(text) {
        // Wait for textarea to be available
        const textarea = await this.waitForElement('textarea[placeholder="Type something"]');
        if (!textarea) {
            console.error('Textarea not found after retries');
            return;
        }

        console.log('Found textarea, inputting text:', text);
        textarea.value = text;

        // Trigger input event to enable the Run button
        const inputEvent = new Event('input', { bubbles: true });
        textarea.dispatchEvent(inputEvent);

        setTimeout(() => {
            // Enable Grounding button (added section)
            this.enableGrounding();

            const runButton = document.querySelector('button[aria-label="Run"]');
            if (runButton) {
                runButton.click();
            }

        }, 200);


    },
    async enableGrounding() {
        const groundingButton = await this.waitForElement('button[aria-label="Grounding with Google Search"]');
        if (groundingButton) {
            const isCurrentlyChecked = groundingButton.getAttribute('aria-checked') === 'true';
            if (!isCurrentlyChecked) {
                console.log("Enabling Grounding with Google Search");
                groundingButton.click();
            } else {
                console.log("Grounding is already enabled")
            }
        } else {
            console.error('Could not find the "Grounding with Google Search" button.');
        }
    }
};