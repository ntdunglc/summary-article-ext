window.geminiBot = {
    input(text) {
        const textarea = document.querySelector('textarea[placeholder="Type something"]');
        if (textarea) {
            debugger
            console.log(text)
            textarea.value = text;
            // Trigger input event to enable the Run button
            const inputEvent = new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);

            setTimeout(() => {
                const runButton = document.querySelector('button[aria-label="Run"]');
                if (runButton) {
                    runButton.click();
                }
            }, 1000);
        }
    }
};