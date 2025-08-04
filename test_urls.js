const cheerio = require('cheerio');
const fetch = require('node-fetch');

async function fetchCurrentTaxSaleUrls() {
    try {
        console.log('🔄 Fetching current tax sale URLs from website...');
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Look for links containing specific text patterns
        let taxSaleUrl = null;
        let photoListUrl = null;
        
        // Find tax sale list link
        $('a').each((i, element) => {
            const linkText = $(element).text().trim();
            const href = $(element).attr('href');
            
            if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                console.log(`Found link: "${linkText}" -> ${href}`);
                if (linkText.toLowerCase().includes('tax sale list') && !linkText.toLowerCase().includes('photo')) {
                    taxSaleUrl = href;
                    console.log(`✅ Found Tax Sale List URL: ${linkText} -> ${href}`);
                } else if (linkText.toLowerCase().includes('tax sale photo list')) {
                    photoListUrl = href;
                    console.log(`✅ Found Tax Sale Photo List URL: ${linkText} -> ${href}`);
                }
            }
        });
        
        if (!taxSaleUrl) {
            throw new Error('Could not find Tax Sale List URL on the webpage');
        }
        
        console.log(`✅ Successfully fetched current URLs from tax sale website`);
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

// Test the function
fetchCurrentTaxSaleUrls().then(result => {
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
}).catch(error => {
    console.error('Test failed:', error);
});
