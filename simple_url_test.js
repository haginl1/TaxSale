const cheerio = require('cheerio');

async function testUrlFetching() {
    console.log('Testing URL fetching...');
    
    try {
        // Use node-fetch if available, otherwise use https
        let fetch;
        try {
            fetch = require('node-fetch');
        } catch (e) {
            console.log('node-fetch not available, using https');
            const https = require('https');
            const { URL } = require('url');
            
            fetch = (url) => {
                return new Promise((resolve, reject) => {
                    const urlObj = new URL(url);
                    const req = https.request({
                        hostname: urlObj.hostname,
                        path: urlObj.pathname + urlObj.search,
                        method: 'GET'
                    }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            resolve({
                                ok: res.statusCode >= 200 && res.statusCode < 300,
                                status: res.statusCode,
                                text: () => Promise.resolve(data),
                                buffer: () => Promise.resolve(Buffer.from(data))
                            });
                        });
                    });
                    req.on('error', reject);
                    req.end();
                });
            };
        }
        
        console.log('Fetching tax sale page...');
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        
        if (!response.ok) {
            console.log(`HTTP Error: ${response.status}`);
            return;
        }
        
        const html = await response.text();
        console.log(`Page loaded: ${html.length} characters`);
        
        const $ = cheerio.load(html);
        
        let currentTaxSaleUrl = null;
        let currentPhotoUrl = null;
        
        $('a').each((i, element) => {
            const linkText = $(element).text().trim();
            const href = $(element).attr('href');
            
            if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                console.log(`Found link: "${linkText}" -> ${href}`);
                
                if (linkText.toLowerCase().includes('tax sale list') && !linkText.toLowerCase().includes('photo')) {
                    currentTaxSaleUrl = href;
                    console.log(`✅ Tax Sale URL: ${href}`);
                } else if (linkText.toLowerCase().includes('tax sale photo list')) {
                    currentPhotoUrl = href;
                    console.log(`✅ Photo URL: ${href}`);
                }
            }
        });
        
        if (currentTaxSaleUrl) {
            console.log(`\nFinal URLs found:`);
            console.log(`Tax Sale: ${currentTaxSaleUrl}`);
            console.log(`Photo: ${currentPhotoUrl}`);
            
            // Extract the ID from the URL
            const match = currentTaxSaleUrl.match(/\/([a-f0-9-]{36})$/);
            if (match) {
                console.log(`PDF ID: ${match[1]}`);
            }
        } else {
            console.log('❌ No tax sale URLs found');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testUrlFetching();
