// Quick Fix Script for Geocoding Issues
// Run this to update the geocode cache with correct coordinates

const fs = require('fs');
const fetch = require('node-fetch');

const problemAddresses = [
    '108 Blaine Ct',
    '524 E Park Ave'
];

async function fixGeocoding() {
    console.log('🔧 Fixing geocoding for known addresses...');
    
    let cache = {};
    
    // Load existing cache if it exists
    try {
        const cacheData = fs.readFileSync('geocode_cache.json', 'utf8');
        cache = JSON.parse(cacheData);
        console.log('📂 Loaded existing cache');
    } catch (e) {
        console.log('📂 Creating new cache');
    }
    
    // Fix each address
    for (const address of problemAddresses) {
        console.log(`\n🔍 Fixing: ${address}`);
        
        const cleanAddress = address.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const cacheKey = `${cleanAddress}_`.replace(/[^a-z0-9_]/g, '_');
        
        try {
            const searchAddress = `${address}, Chatham County, GA`;
            const encodedAddress = encodeURIComponent(searchAddress);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;
            
            const response = await fetch(url, {
                headers: { 'User-Agent': 'TaxSaleApp/1.0' }
            });
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                const result = data[0];
                cache[cacheKey] = {
                    lat: parseFloat(result.lat),
                    lon: parseFloat(result.lon),
                    display_name: result.display_name,
                    address: result.address,
                    timestamp: new Date().toISOString()
                };
                console.log(`✅ Fixed: ${result.display_name}`);
            }
            
            // Wait between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`❌ Error fixing ${address}: ${error.message}`);
        }
    }
    
    // Save the updated cache
    fs.writeFileSync('geocode_cache.json', JSON.stringify(cache, null, 2));
    console.log('\n💾 Cache updated successfully!');
    console.log('🔄 Restart your server to see the changes.');
}

fixGeocoding();
