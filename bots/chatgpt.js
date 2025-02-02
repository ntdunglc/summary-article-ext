window.chatgptBot = {
    input(text) {
        setTimeout(() => {
            debugger
            const textarea = document.querySelector('#prompt-textarea');
            if (textarea) {
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

                textarea.innerHTML = formattedHtml;

                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label="Send prompt"]');
                    if (sendButton) sendButton.click();
                }, 1000);
            }
        }, 1000);
    }
};