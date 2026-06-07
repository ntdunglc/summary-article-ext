window.aistudioBot = {
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
     * Waits for the Run button to become enabled.
     */
    async waitForRunButton(maxAttempts = 20, delay = 300) {
        const getButton = () => {
            const btn = document.querySelector('ms-run-button button') || 
                        document.querySelector('button[aria-label="Run"]');
            if (btn) return btn;
            
            return Array.from(document.querySelectorAll('button')).find(el => 
                el.textContent && el.textContent.trim() === 'Run'
            );
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

    /**
     * Inputs text into the prompt textarea, enables grounding, closes sidebar, and clicks Run.
     * @param {string} text - The text to input into the prompt textarea.
     */
    async input(text) {
        console.log('aistudioBot: input started');
        const textareaSelector = 'textarea[placeholder*="Start typing"], textarea[aria-label*="Enter a prompt"], textarea[aria-label*="Type something"]';
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
        await this.enableGroundingAndCloseSidebar();

        // Find and wait for enabled Run button
        console.log('Waiting for Run button to become enabled...');
        const runButton = await this.waitForRunButton(25, 300);

        if (runButton) {
            const isDisabled = runButton.disabled || runButton.getAttribute('aria-disabled') === 'true' || runButton.classList.contains('disabled');
            if (!isDisabled) {
                console.log('Clicking enabled Run button:', runButton);
                runButton.click();
            } else {
                console.warn('Run button found but it remained disabled.');
            }
        } else {
            console.error('Run button not found after input and grounding check.');
        }
    },

    /**
     * Ensures the "Grounding with Google Search" slide toggle is enabled.
     * Then checks if the "Run settings" panel is expanded and closes it if needed.
     */
    async enableGroundingAndCloseSidebar() {
        console.log('enableGroundingAndCloseSidebar: Checking Grounding...');
        
        // 1. Try to find the toggle switch directly on the page (Old layout)
        const directSwitch = document.querySelector('button[role="switch"][aria-label*="Grounding with Google Search" i]');
        if (directSwitch) {
            console.log('enableGroundingAndCloseSidebar: Found direct switch on the page:', directSwitch);
            const isCurrentlyChecked = directSwitch.getAttribute('aria-checked') === 'true';
            if (!isCurrentlyChecked) {
                console.log("enableGroundingAndCloseSidebar: Enabling direct grounding switch...");
                directSwitch.click();
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                console.log("enableGroundingAndCloseSidebar: Direct grounding switch is already enabled.");
            }
        } else {
            // 2. Check if grounding chip is visible (New layout)
            const isGroundingChipVisible = () => {
                const chips = Array.from(document.querySelectorAll('.tool-name, .enabled-tool, button'));
                return chips.some(el => el.textContent && el.textContent.includes('Grounding with Google Search'));
            };

            if (isGroundingChipVisible()) {
                console.log('enableGroundingAndCloseSidebar: Grounding chip is already visible.');
            } else {
                console.log('enableGroundingAndCloseSidebar: Grounding chip not found. Opening Tools menu...');
                const toolsButton = document.querySelector('button[aria-label*="tools" i]') || 
                                    document.querySelector('button[dialoglabel*="Tools" i]') ||
                                    Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Tools'));
                
                if (toolsButton) {
                    console.log('enableGroundingAndCloseSidebar: Clicking Tools button:', toolsButton);
                    toolsButton.click();
                    await new Promise(resolve => setTimeout(resolve, 600)); // wait for tools menu to open
                    
                    const overlay = document.querySelector('.cdk-overlay-container') || document;
                    const elements = Array.from(overlay.querySelectorAll('*')).reverse();
                    
                    let groundingItem = null;
                    for (const el of elements) {
                        if (el.textContent && el.textContent.includes('Grounding with Google Search')) {
                            groundingItem = el;
                            break;
                        }
                    }
                    
                    if (groundingItem) {
                        console.log('enableGroundingAndCloseSidebar: Found grounding item in menu:', groundingItem);
                        const clickable = groundingItem.closest('button, [role="switch"], [role="checkbox"], mat-slide-toggle') || groundingItem;
                        
                        const isChecked = clickable.getAttribute('aria-checked') === 'true' || 
                                          clickable.checked === true || 
                                          Array.from(clickable.classList).some(cls => cls.toLowerCase().includes('checked'));
                        
                        if (!isChecked) {
                            console.log('enableGroundingAndCloseSidebar: Clicking grounding item to enable:', clickable);
                            clickable.click();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } else {
                            console.log('enableGroundingAndCloseSidebar: Grounding is already enabled in the menu.');
                        }
                    } else {
                        console.warn('enableGroundingAndCloseSidebar: Could not find Grounding option in the Tools menu.');
                    }
                    
                    // Close the tools menu
                    const backdrop = document.querySelector('.cdk-overlay-backdrop');
                    if (backdrop) {
                        backdrop.click();
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } else {
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } else {
                    console.warn('enableGroundingAndCloseSidebar: Tools button not found.');
                }
            }
        }

        // 3. Check and Close Sidebar
        console.log('enableGroundingAndCloseSidebar: Checking if Run Settings panel is expanded...');
        const panelSelector = 'ms-run-settings.expanded';
        const closeButtonSelectorInside = 'button[aria-label="Close run settings panel"]';
        const expandedPanel = document.querySelector(panelSelector);

        if (expandedPanel) {
            console.log('enableGroundingAndCloseSidebar: Run Settings panel is expanded. Attempting to close...');
            const closeButton = expandedPanel.querySelector(closeButtonSelectorInside) || document.querySelector(closeButtonSelectorInside);
            if (closeButton) {
                closeButton.click();
                console.log('enableGroundingAndCloseSidebar: Clicked the close button for the Run Settings panel.');
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                console.warn('enableGroundingAndCloseSidebar: Close button not found inside expanded panel.');
            }
        } else {
            console.log('enableGroundingAndCloseSidebar: Run Settings panel is not expanded.');
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