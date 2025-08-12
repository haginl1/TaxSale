// Force refresh script for Render deployment
const fetch = require('node-fetch');

const RENDER_URL = 'https://your-app-name.onrender.com'; // Replace with your actual Render URL

async function forceRefresh() {
    console.log('🔄 Forcing database refresh on Render...');
    
    try {
        // First, clear any cached data
        console.log('1️⃣ Clearing cache...');
        const clearResponse = await fetch(`${RENDER_URL}/api/clear-cache`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            timeout: 30000
        });
        
        if (clearResponse.ok) {
            console.log('✅ Cache cleared successfully');
        } else {
            console.log('⚠️ Cache clear failed, continuing...');
        }
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force refresh Chatham County data
        console.log('2️⃣ Force refreshing Chatham County data...');
        const refreshResponse = await fetch(`${RENDER_URL}/api/force-refresh/chatham`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            timeout: 120000 // 2 minute timeout for PDF processing
        });
        
        if (refreshResponse.ok) {
            const result = await refreshResponse.json();
            console.log('✅ Force refresh successful!');
            console.log(`📊 Total listings: ${result.totalListings}`);
            console.log(`🗺️ Geocoded properties: ${result.geocodeStats?.successful || 0}`);
        } else {
            console.log('❌ Force refresh failed:', refreshResponse.status, refreshResponse.statusText);
        }
        
        // Test the API
        console.log('3️⃣ Testing API response...');
        const testResponse = await fetch(`${RENDER_URL}/api/tax-sale-listings/chatham`, {
            timeout: 30000
        });
        
        if (testResponse.ok) {
            const data = await testResponse.json();
            console.log(`✅ API working! Found ${data.totalListings} listings`);
        } else {
            console.log('❌ API test failed:', testResponse.status);
        }
        
    } catch (error) {
        console.error('❌ Error during force refresh:', error.message);
        console.log('\n🔧 Troubleshooting tips:');
        console.log('1. Make sure your Render app is deployed and running');
        console.log('2. Update the RENDER_URL in this script with your actual URL');
        console.log('3. Check Render logs for any errors');
        console.log('4. Try accessing the URL manually in a browser');
    }
}

// Run the force refresh
forceRefresh();
