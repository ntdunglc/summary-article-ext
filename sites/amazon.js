window.amazonExtractor = {
    getPrompt() {
        return `As a shopping assistant, please analyze this Amazon product and provide a comprehensive review in the following format:

### Product Overview
- Name and brand
- Price point and positioning
- Target market and main use cases
- Key differentiators

### Feature Analysis
- Key features and their benefits
- Technical specifications and what they mean for users
- Build quality and materials
- Notable innovations or unique aspects

### Value Assessment
- Price-to-feature ratio analysis
- Comparison with similar products
- Who should buy this product
- Who should consider alternatives

### Pros and Cons
- Major advantages
- Potential drawbacks
- Important considerations
- Usage scenarios where this product excels

### Recommendations
- Best use cases
- Alternative suggestions if any
- Additional items or accessories to consider
- Installation or setup tips if relevant

Here is the product information:`;
    },

    cleanText(text) {
        if (!text) return '';
        // Remove JavaScript
        text = text.replace(/\bvar\b[\s\S]*?\};?/g, '');
        // Remove CSS
        text = text.replace(/{[\s\S]*?}/g, '');
        // Remove HTML comments
        text = text.replace(/<!--[\s\S]*?-->/g, '');
        // Remove multiple spaces and trim
        return text.replace(/\s+/g, ' ').trim();
    },

    extractTechDetails() {
        const techDetails = {};
        const detailsSection = document.querySelector('#productDetails_techSpec_section_1, #detailBullets_feature_div');

        if (detailsSection) {
            const rows = detailsSection.querySelectorAll('tr, .detail-bullet');
            rows.forEach(row => {
                let key = row.querySelector('th, .a-text-bold')?.textContent?.trim()?.replace(/[:\\]/g, '') || '';
                let value = row.querySelector('td, .a-list-item')?.textContent?.trim() || '';

                // Clean up the value
                value = this.cleanText(value);

                // Skip empty or javascript-only values
                if (key && value && !value.includes('var') && !value.includes('function')) {
                    key = key.replace(/\u200B/g, ''); // Remove zero-width spaces
                    techDetails[key] = value;
                }
            });
        }

        return techDetails;
    },

    extractReviews() {
        const reviewsData = {
            averageRating: document.querySelector('#acrPopover')?.getAttribute('title')?.trim() || '',
            totalReviews: document.querySelector('#acrCustomerReviewText')?.textContent?.trim() || '',
            ratingsBreakdown: []
        };

        const ratingsTable = document.querySelector('table#histogramTable');
        if (ratingsTable) {
            ratingsTable.querySelectorAll('tr').forEach(row => {
                const stars = row.querySelector('.a-text-right a')?.textContent?.trim();
                const percentage = row.querySelector('.a-text-right .a-size-small')?.textContent?.trim();
                if (stars && percentage) {
                    reviewsData.ratingsBreakdown.push({
                        stars,
                        percentage
                    });
                }
            });
        }

        return reviewsData;
    },

    extractAPlus() {
        const aPlusContent = document.querySelector('#aplus, #dpx-aplus-product-description_feature_div');
        if (!aPlusContent) return '';

        // Only get text content and clean it
        const textContent = Array.from(aPlusContent.querySelectorAll('p, h3, li, td'))
            .map(el => el.textContent.trim())
            .filter(text => text && !text.includes('var') && !text.includes('function'))
            .join('\\n');

        return this.cleanText(textContent);
    },

    extractFeatures() {
        const features = [];
        const featuresList = document.querySelector('#feature-bullets');
        if (featuresList) {
            featuresList.querySelectorAll('li:not(.aok-hidden) span.a-list-item').forEach(item => {
                const text = item.textContent.trim();
                if (text && !text.toLowerCase().includes('warranty')) {
                    features.push(text);
                }
            });
        }
        return features;
    },

    extract() {
        try {
            const basicInfo = {
                title: document.querySelector('#productTitle')?.textContent?.trim(),
                brand: document.querySelector('.po-brand .po-break-word, #bylineInfo')?.textContent?.trim(),
                price: document.querySelector('.a-price .a-offscreen')?.textContent?.trim(),
                availability: document.querySelector('#availability')?.textContent?.trim()
            };

            const productInfo = {
                ...basicInfo,
                techDetails: this.extractTechDetails(),
                features: this.extractFeatures(),
                reviews: this.extractReviews(),
                aplus: this.extractAPlus(),
                url: document.location.href
            };

            // Format the extracted information
            const formattedInfo = Object.entries(productInfo)
                .map(([key, value]) => {
                    if (!value || (Array.isArray(value) && value.length === 0)) return null;
                    if (typeof value === 'object') {
                        return `${key.toUpperCase()}:\n${JSON.stringify(value, null, 2)}`;
                    }
                    return `${key.toUpperCase()}: ${value}`;
                })
                .filter(Boolean)
                .join('\n\n');

            const fullText = this.getPrompt() + '\n\n' + formattedInfo;

            chrome.runtime.sendMessage({
                type: 'extractedText',
                text: fullText,
                contentType: 'amazon'
            });

        } catch (error) {
            console.error('Error extracting Amazon product info:', error);
        }
    }
};