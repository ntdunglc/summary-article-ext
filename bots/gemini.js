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

    sendDebugLog(stage, details = {}) {
        const payload = {
            type: 'extractionDebugLog',
            site: 'gemini_bot',
            stage: stage,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            details: details
        };
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage(payload).catch(() => {});
            } else if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
                browser.runtime.sendMessage(payload).catch(() => {});
            }
        } catch (_) {}
        console.log(`%c[Gemini Bot] [${stage}]`, 'color: #0284c7; font-weight: bold;', details);
    },

    async input(text) {
        // 1. Select the editor using the class and role
        const promptBoxSelector = 'div.ql-editor[contenteditable="true"], [contenteditable="true"]'; 
        const promptBox = await this.waitForElement(promptBoxSelector);

        if (!promptBox) {
            this.sendDebugLog('GeminiError', { error: 'Prompt box not found' });
            console.error('Prompt box not found.');
            return;
        }

        this.sendDebugLog('GeminiInputStart', {
            incomingTextLength: text.length
        });

        // 2. Focus the editor
        window.focus();
        promptBox.focus();
        promptBox.classList.remove('ql-blank');

        // Helper: Copy to system clipboard without requiring window focus
        const copyTextToClipboard = (str) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = str;
                ta.style.position = 'fixed';
                ta.style.top = '0';
                ta.style.left = '0';
                ta.style.width = '10px';
                ta.style.height = '10px';
                ta.style.opacity = '0.01';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const copied = document.execCommand('copy');
                document.body.removeChild(ta);
                if (copied) return true;
            } catch (_) {}
            return false;
        };

        // 3. Strategy 1: Copy to system clipboard and trigger trusted native browser paste
        // With clipboardRead/Write extension permissions, document.execCommand('paste') triggers the exact same native C++ paste path as Cmd+V
        let pasteSucceeded = false;
        let origClipboard = null;
        try {
            // Backup user's original clipboard content if readable
            if (navigator.clipboard && navigator.clipboard.readText) {
                origClipboard = await navigator.clipboard.readText().catch(() => null);
            }

            let copied = copyTextToClipboard(text);
            if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text).catch(() => {});
                copied = true;
            }
            this.sendDebugLog('GeminiClipboardCopy', { copied, textLength: text.length });

            promptBox.focus();
            const ok = document.execCommand('paste');
            this.sendDebugLog('GeminiSystemClipboardPaste', { execCommandReturned: ok, textLength: text.length });

            // Poll for native paste to land in the DOM/Quill editor
            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(r => setTimeout(r, 100));
                const len = (promptBox.textContent || '').length;
                if (len >= text.length * 0.8) {
                    pasteSucceeded = true;
                    this.sendDebugLog('GeminiPastePopulated', { populatedLength: len, attemptsNeeded: attempt + 1 });
                    break;
                }
            }

            // Restore user's previous clipboard content
            if (origClipboard !== null && origClipboard !== text) {
                copyTextToClipboard(origClipboard);
            }
        } catch (e) {
            this.sendDebugLog('GeminiClipboardError', { error: e.message });
        }

        // 4. Fallback: Only run if native paste did NOT populate the editor
        let currentDomLength = (promptBox.textContent || '').length;
        if (!pasteSucceeded && currentDomLength < text.length * 0.8) {
            try {
                const quill = promptBox.__quill || 
                              promptBox.__quillInstance || 
                              (typeof window.Quill !== 'undefined' && window.Quill.find ? window.Quill.find(promptBox) : null);
                if (quill && typeof quill.setText === 'function') {
                    quill.setText(text);
                    this.sendDebugLog('GeminiQuillDirectInject', { usingQuillInstance: true });
                }
            } catch (e) {
                console.warn('Quill direct injection failed:', e);
            }

            currentDomLength = (promptBox.textContent || '').length;
            if (currentDomLength < text.length * 0.8) {
                this.sendDebugLog('GeminiHtmlFallback', {
                    currentDomLength,
                    incomingLength: text.length
                });
                const formattedHtml = text
                    .split('\n')
                    .map(line => {
                        if (line.trim() === '') return '<p><br></p>';
                        const escaped = line
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        return `<p>${escaped}</p>`;
                    })
                    .join('');
                promptBox.innerHTML = formattedHtml;
                promptBox.classList.remove('ql-blank');
            }
        }

        // 7. Dispatch Input and Change events to notify Angular Form Controller
        promptBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: text }));
        promptBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        promptBox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        const finalLength = (promptBox.textContent || '').length;
        this.sendDebugLog('GeminiFinalVerification', {
            incomingTextLength: text.length,
            finalEditorLength: finalLength,
            retentionRatio: ((finalLength / text.length) * 100).toFixed(1) + '%'
        });

        // 8. Wait 1200ms for Angular / Quill state to fully synchronize before sending
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Selector for the enabled send button
        const sendButtonSelector = 'button[aria-label="Send message"]:not([aria-disabled="true"]), button.send-button:not([disabled])';
        const sendButton = await this.waitForElement(sendButtonSelector, 15, 400);

        if (sendButton) {
            this.sendDebugLog('GeminiSendClicked', { buttonFound: true, finalEditorLength: finalLength });
            sendButton.click();
        } else {
            this.sendDebugLog('GeminiSendFailed', { buttonFound: false });
            console.error('Send button is still disabled.');
        }
    }
};

// --- Usage ---
// window.geminiBot.input("Hello from the console!");