window.deepseekBot = {
    input(text) {
        const textarea = document.getElementById('chat-input');
        if (textarea) {
            textarea.value = text;

            const inputEvent = new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);

            setTimeout(() => {
                const sendButton = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .find(el => {
                        const buttonText = el.textContent?.trim();
                        return buttonText === 'DeepThink (R1)' || buttonText === 'Search';
                    });

                if (sendButton) {
                    sendButton.click();
                }
            }, 1000);
        }
    }
};