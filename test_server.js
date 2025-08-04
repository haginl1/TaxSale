const express = require('express');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const app = express();
const PORT = 3003;

// Function to dynamically fetch current PDF URLs from the tax sale website
async function fetchCurrentTaxSaleUrls() {
    try {
        console.log('🔄 Fetching current tax sale URLs from website...');
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let taxSaleUrl = null;
        let photoListUrl = null;
        
        $('a').each((i, element) => {
            const linkText = $(element).text().trim();
            const href = $(element).attr('href');
            
            if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                console.log(`Found link: "${linkText}" -> ${href}`);
                if (linkText.toLowerCase().includes('tax sale list') && !linkText.toLowerCase().includes('photo')) {
                    taxSaleUrl = href;
                } else if (linkText.toLowerCase().includes('tax sale photo list')) {
                    photoListUrl = href;
                }
            }
        });
        
        return {
            taxSaleUrl,
            photoListUrl,
            fetchedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Error fetching current tax sale URLs:', error.message);
        return null;
    }
}

app.get('/test-urls', async (req, res) => {
    console.log('Testing URL fetching...');
    const urls = await fetchCurrentTaxSaleUrls();
    res.json({
        success: urls !== null,
        urls: urls,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}/test-urls`);
});
