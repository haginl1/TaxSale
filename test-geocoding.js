// Simple Address Testing Tool
const fetch = require('node-fetch');

// Test addresses that should work
const testAddresses = [
    '108 Blaine Ct, Savannah, GA',
    '524 E Park Ave, Savannah, GA',
    '108 Blaine Ct, Chatham County, GA',
    '524 E Park Ave, Chatham County, GA'
];

async function testGeocoding(address) {
    try {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;
        
        console.log(`\n🔍 Testing: ${address}`);
        console.log(`URL: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'TaxSaleApp/1.0 (tax-sale-listings@example.com)'
            }
        });
        
        if (!response.ok) {
            console.log(`❌ HTTP Error: ${response.status}`);
            return;
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = data[0];
            console.log(`✅ Found: ${result.display_name}`);
            console.log(`📍 Coordinates: ${result.lat}, ${result.lon}`);
            
            // Check if it's in the right area
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            const isInChatham = lat >= 31.8 && lat <= 32.4 && lon >= -81.5 && lon <= -80.8;
            console.log(`🗺️  In Chatham County bounds: ${isInChatham ? 'YES' : 'NO'}`);
        } else {
            console.log(`❌ No results found`);
        }
        
        // Wait between requests to be polite to the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function runTests() {
    console.log('🚀 Starting geocoding tests...\n');
    
    for (const address of testAddresses) {
        await testGeocoding(address);
    }
    
    console.log('\n✨ Tests complete!');
}

runTests();
