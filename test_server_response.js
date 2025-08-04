const fetch = require('node-fetch');

async function testServer() {
    console.log('=== TESTING SERVER RESPONSE ===\n');
    
    const testUrls = [
        'http://localhost:3001/api/tax-sale-listings/chatham?forceRefresh=true',
        'http://localhost:3002/api/tax-sale-listings/chatham?forceRefresh=true'
    ];
    
    for (const url of testUrls) {
        console.log(`Testing: ${url}`);
        try {
            const response = await fetch(url);
            console.log(`Status: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`Response received:`);
                console.log(`- Total listings: ${data.totalListings || 'N/A'}`);
                console.log(`- From cache: ${data.fromCache || 'N/A'}`);
                console.log(`- County: ${data.county || 'N/A'}`);
                
                if (data.metadata) {
                    console.log(`- Processed at: ${data.metadata.processedAt || 'N/A'}`);
                    console.log(`- Source: ${data.metadata.source || 'N/A'}`);
                }
                
                console.log('✅ Server responded successfully');
                return; // Exit after first successful response
            } else {
                console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        console.log('---');
    }
    
    console.log('❌ No server responded successfully');
}

testServer();
