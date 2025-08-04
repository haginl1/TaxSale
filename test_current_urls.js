const cheerio = require('cheerio');
const fetch = require('node-fetch');

async function testCurrentUrls() {
    try {
        console.log('=== TESTING CURRENT TAX SALE URLS ===\n');
        
        console.log('🔄 Fetching current tax sale URLs from website...');
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
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
                    console.log(`✅ MAIN TAX SALE URL: ${href}`);
                } else if (linkText.toLowerCase().includes('tax sale photo list')) {
                    photoListUrl = href;
                    console.log(`✅ PHOTO LIST URL: ${href}`);
                }
            }
        });
        
        console.log('\n=== CURRENT URLS ===');
        console.log(`Tax Sale: ${taxSaleUrl}`);
        console.log(`Photo List: ${photoListUrl}`);
        
        // Test if we can fetch the PDF
        if (taxSaleUrl) {
            console.log('\n🔄 Testing PDF fetch...');
            const pdfResponse = await fetch(taxSaleUrl);
            console.log(`PDF Response Status: ${pdfResponse.status}`);
            console.log(`PDF Content-Length: ${pdfResponse.headers.get('content-length')}`);
            console.log(`PDF Content-Type: ${pdfResponse.headers.get('content-type')}`);
            
            if (pdfResponse.ok) {
                const buffer = await pdfResponse.buffer();
                console.log(`✅ PDF downloaded successfully: ${buffer.length} bytes`);
                
                // Calculate hash like the system does
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256').update(buffer).digest('hex');
                console.log(`PDF Hash: ${hash}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testCurrentUrls();
