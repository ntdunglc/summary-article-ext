const GEMINI_FLASH_HIGH_LOCK_ATTR = 'data-gemini-flash-high-lock';

window.geminiBot = {
    async waitForElement(selector, maxAttempts = 20, delay = 500) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const element = document.querySelector(selector);
            if (element) { return element; }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0;
    },

    isItemChecked(el) {
        if (!el) return false;
        return el.classList.contains('selected') ||
               el.getAttribute('aria-checked') === 'true' ||
               el.getAttribute('aria-selected') === 'true' ||
               el.querySelector('gem-menu-item-content.selected, [aria-label="Selected"], mat-icon[fonticon="check"], mat-icon[data-mat-icon-name="check"]') !== null;
    },

    isItemDisabled(el) {
        if (!el) return true;
        return el.getAttribute('aria-disabled') === 'true' ||
               el.classList.contains('disabled') ||
               el.querySelector('.disabled') !== null;
    },

    isSidebarElement(el) {
        if (!el) return false;
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('settings') || aria.includes('sidebar') || aria.includes('close') || aria.includes('upload') || aria.includes('add files') || aria.includes('dictate')) {
            return true;
        }
        // Note: <side-navigation-v2> wraps the entire app including <bard-sidenav-content> (main chat area).
        if (el.closest('bard-mode-switcher, .model-picker-container, input-area-v2, .input-area, .text-input-field')) {
            return false;
        }
        return !!el.closest('bard-sidenav, side-navigation-content, sidenav-mavatar-footer, nav, aside, .side-nav');
    },

    findModeButton() {
        const selectors = [
            '[data-test-id="bard-mode-menu-button"]',
            'bard-mode-switcher button',
            '.model-picker-container button',
            'button.input-area-switch',
            'button[aria-label*="mode picker" i]',
            'button[aria-label*="model picker" i]'
        ];
        for (const sel of selectors) {
            const btns = document.querySelectorAll(sel);
            for (const btn of btns) {
                if (this.isVisible(btn) && !this.isSidebarElement(btn)) return btn;
            }
        }

        const inputScope = document.querySelector('bard-mode-switcher, .model-picker-container, input-area-v2, .input-area, .text-input-field');
        if (inputScope) {
            const buttons = inputScope.querySelectorAll('button, [role="button"]');
            for (const btn of buttons) {
                if (!this.isVisible(btn) || this.isSidebarElement(btn)) continue;
                const txt = (btn.textContent || '').trim().toLowerCase();
                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                if ((txt.startsWith('flash') || txt.startsWith('pro') || txt.includes('flash-lite') || aria.includes('mode picker') || aria.includes('model picker')) && txt.length < 40) {
                    return btn;
                }
            }
        }

        return null;
    },

    isHighSelectedOnButton(btn = this.findModeButton()) {
        if (!btn) return false;
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        return text.includes('high') || aria.includes('high');
    },

    isFlashHighSelectedOnButton(btn = this.findModeButton()) {
        return this.isHighSelectedOnButton(btn);
    },

    isModelMenu(el) {
        if (!el) return false;
        const txt = (el.textContent || '').toLowerCase();
        return (txt.includes('flash') || txt.includes('pro') || txt.includes('argon') || txt.includes('thinking')) && !txt.includes('personal intelligence');
    },

    getOpenMenu() {
        const menus = document.querySelectorAll('gem-menu, [role="menu"]');
        for (const menu of menus) {
            if (this.isVisible(menu)) {
                if (!this.isModelMenu(menu) && menu.textContent.toLowerCase().includes('personal intelligence')) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    return null;
                }
                if (this.isModelMenu(menu)) return menu;
            }
        }
        return null;
    },

    async openMenu() {
        let menu = this.getOpenMenu();
        if (menu) return menu;

        const btn = this.findModeButton();
        if (!btn) return null;

        if (btn.getAttribute('aria-expanded') !== 'true') {
            btn.click();
        }

        for (let i = 0; i < 20; i++) {
            await this.sleep(100);
            menu = this.getOpenMenu();
            if (menu) return menu;

            if (i === 7 && btn.getAttribute('aria-expanded') !== 'true') {
                const target = btn.querySelector('.mdc-button__label, .logo-pill-label-container') || btn;
                target.click();
            }
        }

        return this.getOpenMenu();
    },

    async closeMenu() {
        const btn = this.findModeButton();
        if (!this.getOpenMenu() && btn?.getAttribute('aria-expanded') !== 'true') {
            return;
        }
        const editor = document.querySelector('div.ql-editor[contenteditable="true"], [contenteditable="true"]');
        if (editor) {
            editor.focus();
            editor.click();
            await this.sleep(150);
        }
        if (this.getOpenMenu() || btn?.getAttribute('aria-expanded') === 'true') {
            if (btn && btn.getAttribute('aria-expanded') === 'true') {
                btn.click();
                await this.sleep(150);
            } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                await this.sleep(150);
            }
        }
    },

    getItemLabel(it) {
        return (it.querySelector('.label')?.textContent || it.textContent || '').trim().toLowerCase();
    },

    getItemSublabel(it) {
        return (it.querySelector('.sublabel')?.textContent || '').trim().toLowerCase();
    },

    simulateRealClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const eventOpts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 0,
            buttons: 1
        };
        try {
            el.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, pointerType: 'mouse', isPrimary: true, pointerId: 1 }));
            el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
            el.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, pointerType: 'mouse', isPrimary: true, pointerId: 1, buttons: 0 }));
            el.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, buttons: 0 }));
        } catch (_) {}
        el.click();
    },

    findHighItem(items) {
        return items.find(it => {
            if (it.getAttribute('data-test-id') === 'mode-picker-sign-in-button' || it.classList.contains('mode-picker-sign-in-button')) {
                return false;
            }
            const label = this.getItemLabel(it);
            const sublabel = this.getItemSublabel(it);
            return label === 'high' || /\bhigh\b/.test(label) || sublabel.includes('extra thorough');
        });
    },

    async selectFlashHigh() {
        const initialBtn = this.findModeButton();
        if (initialBtn && this.isHighSelectedOnButton(initialBtn)) {
            return true;
        }

        if (document.documentElement.getAttribute(GEMINI_FLASH_HIGH_LOCK_ATTR) === '1') {
            for (let i = 0; i < 30; i++) {
                await this.sleep(100);
                if (document.documentElement.getAttribute(GEMINI_FLASH_HIGH_LOCK_ATTR) !== '1') break;
            }
            return this.isHighSelectedOnButton();
        }

        document.documentElement.setAttribute(GEMINI_FLASH_HIGH_LOCK_ATTR, '1');
        try {
            let menu = await this.openMenu();
            if (!menu) return false;

            const getMenuItems = async () => {
                for (let i = 0; i < 15; i++) {
                    const items = Array.from(document.querySelectorAll('gem-menu-item, [role="menuitem"]'));
                    if (items.length >= 2) return items;
                    await this.sleep(100);
                }
                return Array.from(document.querySelectorAll('gem-menu-item, [role="menuitem"]'));
            };

            let items = await getMenuItems();

            // 1. Ensure Flash model is selected (not Flash-Lite, not Pro)
            const flashItem = items.find(it => {
                const text = it.textContent.toLowerCase();
                return text.includes('flash') && !text.includes('lite') && !text.includes('fastest');
            });

            if (flashItem && !this.isItemChecked(flashItem)) {
                this.simulateRealClick(flashItem.querySelector('gem-menu-item-content') || flashItem);
                await this.sleep(400);
                menu = await this.openMenu();
                if (menu) items = await getMenuItems();
            }

            // 2. Expand Thinking level submenu if present
            let highItem = this.findHighItem(items);
            if (!highItem) {
                const thinkingLevelTrigger = items.find(it => (it.textContent || '').toLowerCase().includes('thinking level'));
                if (thinkingLevelTrigger) {
                    this.simulateRealClick(thinkingLevelTrigger.querySelector('gem-menu-item-content') || thinkingLevelTrigger);
                    await this.sleep(300);
                    items = await getMenuItems();
                    highItem = this.findHighItem(items);
                }
            }

            if (highItem && !this.isItemDisabled(highItem)) {
                if (!this.isItemChecked(highItem)) {
                    this.simulateRealClick(highItem.querySelector('gem-menu-item-content') || highItem);
                    await this.sleep(350);
                } else {
                    await this.closeMenu();
                }
            } else {
                await this.closeMenu();
                return false;
            }

            await this.closeMenu();

            const editor = document.querySelector('div.ql-editor[contenteditable="true"], [contenteditable="true"]');
            if (editor) {
                editor.focus();
            }

            for (let i = 0; i < 10; i++) {
                if (this.isHighSelectedOnButton()) {
                    this.sendDebugLog('GeminiSelectFlashHighComplete', { verified: true });
                    return true;
                }
                await this.sleep(100);
            }
            return this.isHighSelectedOnButton();
        } catch (err) {
            console.warn('[Gemini Bot] Error selecting High thinking level:', err);
            return false;
        } finally {
            document.documentElement.removeAttribute(GEMINI_FLASH_HIGH_LOCK_ATTR);
        }
    },

    async selectExtendedThinking() {
        return this.selectFlashHigh();
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

        // Wait for the mode switcher toolbar element to mount and select Flash + High before inputting prompt
        await this.waitForElement('[data-test-id="bard-mode-menu-button"], bard-mode-switcher button, button.input-area-switch', 15, 250);
        try {
            await this.selectFlashHigh();
        } catch (err) {
            console.warn('[Gemini Bot] Initial selectFlashHigh warning:', err);
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
        let pasteSucceeded = false;
        let origClipboard = null;
        try {
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

            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(r => setTimeout(r, 100));
                const len = (promptBox.textContent || '').length;
                if (len >= text.length * 0.8) {
                    pasteSucceeded = true;
                    this.sendDebugLog('GeminiPastePopulated', { populatedLength: len, attemptsNeeded: attempt + 1 });
                    break;
                }
            }

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
                this.sendDebugLog('GeminiDomFallback', {
                    currentDomLength,
                    incomingLength: text.length
                });
                while (promptBox.firstChild) {
                    promptBox.removeChild(promptBox.firstChild);
                }
                for (const line of text.split('\n')) {
                    const p = document.createElement('p');
                    if (line.trim() === '') {
                        p.appendChild(document.createElement('br'));
                    } else {
                        p.textContent = line;
                    }
                    promptBox.appendChild(p);
                }
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

        // Verify Flash + High is selected right before submitting the prompt
        if (!this.isFlashHighSelectedOnButton()) {
            try {
                await this.selectFlashHigh();
            } catch (err) {
                console.warn('[Gemini Bot] Pre-submit selectFlashHigh warning:', err);
            }
        }

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