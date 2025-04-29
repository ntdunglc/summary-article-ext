window.geminiBot = {
    /**
     * Waits for an element matching the selector to appear in the DOM.
     * @param {string} selector - The CSS selector to wait for.
     * @param {number} [maxAttempts=20] - Maximum number of attempts.
     * @param {number} [delay=500] - Delay between attempts in milliseconds.
     * @returns {Promise<Element|null>} The found element or null if timeout.
     */
    async waitForElement(selector, maxAttempts = 20, delay = 500) {
        // console.log(`Waiting for element: "${selector}"`); // Optional: Less verbose logging
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) {
                // console.log(`Element found: "${selector}"`); // Optional: Less verbose logging
                return element;
            }
            if (attempt === maxAttempts) {
                console.error(`Element not found after ${maxAttempts} attempts: "${selector}"`);
                break;
            }
            // console.log(`Attempt ${attempt} failed for "${selector}", retrying in ${delay}ms...`); // Optional: Less verbose logging
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    /**
     * Inputs text into the prompt textarea, enables grounding, closes sidebar, and clicks Run.
     * @param {string} text - The text to input into the prompt textarea.
     */
    async input(text) {
        const textareaSelector = 'textarea[aria-label*="Type something"]';
        const textarea = await this.waitForElement(textareaSelector);

        if (!textarea) {
            console.error('Textarea not found after retries. Selector used:', textareaSelector);
            return;
        }

        console.log('Found textarea, inputting text:', text);
        textarea.value = text;
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(inputEvent);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Enable Grounding AND Close Sidebar (if open)
        await this.enableGroundingAndCloseSidebar(); // Call the combined function

        const runButtonSelector = 'button[aria-label="Run"]:not([disabled])';
        // Increase wait time slightly for run button, as grounding/sidebar actions might delay its enabling
        const runButton = await this.waitForElement(runButtonSelector, 25, 300);

        if (runButton) {
            console.log('Clicking enabled Run button.');
            runButton.click();
        } else {
            console.error('Run button not found or not enabled after input and grounding/sidebar check. Selector used:', runButtonSelector);
            const runButtonMaybeDisabled = await this.waitForElement('button[aria-label="Run"]', 1, 10);
            if (runButtonMaybeDisabled) {
                console.warn('Run button was found, but it remained disabled.');
            }
        }
    },

    /**
     * Ensures the "Grounding with Google Search" slide toggle is enabled.
     * Then checks if the "Run settings" panel is expanded and closes it if needed.
     */
    async enableGroundingAndCloseSidebar() {
        console.log('Checking Grounding setting...');
        // --- Selectors ---
        const groundingButtonSelector = 'button[role="switch"][aria-label="Grounding with Google Search"]';
        const panelSelector = 'ms-run-settings.expanded'; // Selector for the expanded panel
        const closeButtonSelectorInside = 'button[aria-label="Close run settings panel"]'; // Selector for the close button *within* the panel

        // --- Step 1: Handle Grounding Toggle ---
        const groundingButton = await this.waitForElement(groundingButtonSelector, 10, 200); // Shorter wait is ok here

        if (groundingButton) {
            const isCurrentlyChecked = groundingButton.getAttribute('aria-checked') === 'true';
            if (!isCurrentlyChecked) {
                console.log("Grounding is disabled, enabling...");
                groundingButton.click();
                await new Promise(resolve => setTimeout(resolve, 150)); // Slightly longer delay after clicking toggle
                console.log("Grounding toggle clicked.");
            } else {
                console.log("Grounding is already enabled.");
            }
        } else {
            console.warn('Could not find the "Grounding with Google Search" toggle button. It might be hidden or UI changed. Selector used:', groundingButtonSelector);
            // Proceed to check sidebar anyway, it might still be open
        }

        // Give UI a moment to potentially update after grounding check/click
        await new Promise(resolve => setTimeout(resolve, 100));

        // --- Step 2: Check and Close Sidebar ---
        console.log('Checking if Run Settings panel is expanded...');
        // Use querySelector directly. We don't need to wait for it to *appear*, just check if it *is* expanded now.
        const expandedPanel = document.querySelector(panelSelector);

        if (expandedPanel) {
            console.log('Run Settings panel is expanded. Attempting to close...');
            // Find the close button *inside* the specific expanded panel element
            const closeButton = expandedPanel.querySelector(closeButtonSelectorInside);
            if (closeButton) {
                closeButton.click();
                console.log('Clicked the close button for the Run Settings panel.');
                await new Promise(resolve => setTimeout(resolve, 150)); // Delay after clicking close
            } else {
                // Log a warning if the panel is expanded but the close button isn't found within it
                console.warn(`Found expanded panel ("${panelSelector}"), but couldn't find the close button ("${closeButtonSelectorInside}") inside it. Panel may remain open.`);
            }
        } else {
            console.log('Run Settings panel is not expanded or not found.');
        }
    }
    // Note: Renamed the function to reflect its dual purpose.
    // If you prefer to keep the old name `enableGrounding`, just rename
    // `enableGroundingAndCloseSidebar` back to `enableGrounding` above and in the `input` function call.
};

// Example Usage (no change needed here):
/*
setTimeout(() => {
   window.geminiBot.input("Write a short poem about a cat watching the rain.");
}, 3000);
*/