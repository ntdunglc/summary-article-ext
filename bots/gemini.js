window.geminiBot = {
    async waitForElement(selector, maxAttempts = 20, delay = 500) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) { return element; }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    async selectExtendedThinking() {
        console.log('selectExtendedThinking: started');
        const isAlreadyChecked = (el) => {
            const interactive = el.closest('mat-slide-toggle, [role="switch"], [role="checkbox"], button, [role="menuitem"], [role="option"]') || el;
            const hasCheckedClass = Array.from(interactive.classList).some(cls => 
                cls.toLowerCase().includes('checked') || cls.toLowerCase().includes('selected')
            );
            return interactive.getAttribute('aria-checked') === 'true' ||
                   interactive.getAttribute('aria-selected') === 'true' ||
                   interactive.checked === true ||
                   hasCheckedClass;
        };

        const findToggle = (searchRoot = document) => {
            const elements = Array.from(searchRoot.querySelectorAll('*')).reverse();
            
            const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            };

            // Pass 1: Strict leaf target options first (case-insensitive exact match)
            const leafTargets = ['extended thinking', 'extended', 'deep think'];
            for (const el of elements) {
                if (el.textContent && isVisible(el)) {
                    const text = el.textContent.trim().toLowerCase();
                    if (leafTargets.includes(text)) {
                        return el;
                    }
                }
            }

            // Pass 2: Submenu triggers second (case-insensitive exact match)
            const triggerTargets = ['thinking level', 'thinking', 'reasoning'];
            for (const el of elements) {
                if (el.textContent && isVisible(el)) {
                    const text = el.textContent.trim().toLowerCase();
                    if (triggerTargets.includes(text)) {
                        return el;
                    }
                }
            }

            // Pass 3: Partial matches
            for (const el of elements) {
                if (el.textContent && isVisible(el)) {
                    const text = el.textContent.toLowerCase();
                    if (text.includes('extended thinking') || text.includes('deep think') || text.includes('thinking level')) {
                        return el;
                    }
                }
            }

            return searchRoot.querySelector('[aria-label*="Extended thinking" i]') ||
                   searchRoot.querySelector('[aria-label*="Thinking level" i]') ||
                   searchRoot.querySelector('[aria-label*="Deep Think" i]');
        };

        const waitForToggleElement = async (maxAttempts = 15, delay = 300, searchRoot = document) => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const element = findToggle(searchRoot);
                if (element) { return element; }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            return null;
        };

        // 1. Check if visible directly on page
        let toggle = findToggle(document);
        if (toggle) {
            console.log('selectExtendedThinking: Found toggle directly on the page:', toggle);
            if (!isAlreadyChecked(toggle)) {
                const clickable = toggle.closest('mat-slide-toggle, [role="switch"], [role="checkbox"], button') || toggle;
                console.log('selectExtendedThinking: Clicking page toggle:', clickable);
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                console.log('selectExtendedThinking: Extended thinking is already enabled on page.');
            }
            return;
        }

        // 2. Open model picker menu
        console.log('selectExtendedThinking: Toggle not visible directly. Waiting for model picker button...');
        const modeButtonSelector = '[data-test-id="bard-mode-menu-button"], button[aria-label*="mode picker"], button[aria-label*="Mode picker"]';
        const modeButton = await this.waitForElement(modeButtonSelector, 20, 500);
        if (!modeButton) {
            console.warn('selectExtendedThinking: Model picker button not found.');
            return;
        }

        console.log('selectExtendedThinking: Clicking model picker button:', modeButton);
        modeButton.click();
        
        // 3. Search inside the menu, waiting for it to appear
        console.log('selectExtendedThinking: Waiting for toggle inside menu...');
        const overlay = document.querySelector('.cdk-overlay-container');
        toggle = await waitForToggleElement(15, 300, overlay || document);
        
        if (toggle) {
            console.log('selectExtendedThinking: Found element inside menu:', toggle);
            const clickable = toggle.closest('mat-slide-toggle, [role="switch"], [role="checkbox"], button, [role="menuitem"], [role="menuitemradio"]') || toggle;
            
            // Check if it's a submenu trigger (has aria-haspopup="true")
            const isSubmenuTrigger = clickable.getAttribute('aria-haspopup') === 'true';
            
            if (isSubmenuTrigger) {
                console.log('selectExtendedThinking: Clickable is a submenu trigger, clicking it to expand:', clickable);
                clickable.click();
                await new Promise(resolve => setTimeout(resolve, 600)); // wait for submenu to animate open
                
                // Now search for the target leaf option inside the submenu
                console.log('selectExtendedThinking: Searching for the leaf option inside the submenu...');
                const subMenuToggle = await waitForToggleElement(15, 300, overlay || document);
                if (subMenuToggle) {
                    console.log('selectExtendedThinking: Found leaf option inside submenu:', subMenuToggle);
                    const leafClickable = subMenuToggle.closest('mat-slide-toggle, [role="switch"], [role="checkbox"], button, [role="menuitem"], [role="menuitemradio"]') || subMenuToggle;
                    if (!isAlreadyChecked(leafClickable)) {
                        console.log('selectExtendedThinking: Clicking leaf option:', leafClickable);
                        leafClickable.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        console.log('selectExtendedThinking: Leaf option is already enabled.');
                    }
                } else {
                    console.warn('selectExtendedThinking: Could not find Extended option inside the submenu.');
                }
            } else {
                // Direct toggle (not a submenu)
                if (!isAlreadyChecked(clickable)) {
                    console.log('selectExtendedThinking: Clicking direct toggle:', clickable);
                    clickable.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.log('selectExtendedThinking: Extended thinking is already enabled.');
                }
            }
        } else {
            console.warn('selectExtendedThinking: Could not find Extended thinking option in the menu after opening.');
        }

        // 4. Close the menu
        console.log('selectExtendedThinking: Closing menu...');
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) {
            console.log('selectExtendedThinking: Clicking backdrop to close menu');
            backdrop.click();
            await new Promise(resolve => setTimeout(resolve, 300));
        } else {
            console.log('selectExtendedThinking: Dispatching Escape to close menu');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log('selectExtendedThinking: complete');
    },

    async input(text) {
        try {
            await this.selectExtendedThinking();
        } catch (e) {
            console.error('Error selecting Extended thinking:', e);
        }

        // 1. Select the editor using the class and role
        const promptBoxSelector = 'div.ql-editor[contenteditable="true"]'; 
        const promptBox = await this.waitForElement(promptBoxSelector);

        if (!promptBox) {
            console.error('Prompt box not found.');
            return;
        }

        // 2. Focus is CRITICAL for execCommand to work
        promptBox.focus();

        // 3. Use execCommand to simulate "pasting" or typing text. 
        // This automatically handles removing the 'ql-blank' class and creates the <p> tags.
        const success = document.execCommand('insertText', false, text);

        // Fallback: If execCommand fails (rare, but possible in some contexts), do it manually
        if (!success) {
            console.log('execCommand failed, using fallback DOM manipulation...');
            promptBox.textContent = text;
            promptBox.classList.remove('ql-blank'); // Force remove placeholder class
        }

        // 4. Dispatch Input event to notify Angular that the form is dirty
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        promptBox.dispatchEvent(inputEvent);

        // 5. Wait for the Send button to become enabled
        await new Promise(resolve => setTimeout(resolve, 600)); // Slightly longer wait for Angular

        // Selector for the enabled send button
        const sendButtonSelector = 'button[aria-label="Send message"]:not([aria-disabled="true"])';
        const sendButton = await this.waitForElement(sendButtonSelector, 10, 500);

        if (sendButton) {
            console.log('Clicking Send button.');
            sendButton.click();
        } else {
            console.error('Send button is still disabled. The input event might not have registered.');
        }
    }
};

// --- Usage ---
// window.geminiBot.input("Hello from the console!");