const fetch = require('node-fetch');

async function testSitusIntegration() {
    try {
        console.log('🔄 Testing enhanced SITUS parsing via API...');
        
        const response = await fetch('http://localhost:3001/api/properties/chatham', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log('\n✅ API Response received!');
        console.log(`Total properties: ${data.properties ? data.properties.length : 0}`);
        
        if (data.properties && data.properties.length > 0) {
            console.log('\n📍 First 5 addresses with SITUS parsing:');
            data.properties.slice(0, 5).forEach((prop, i) => {
                console.log(`${i + 1}. Property Address: ${prop.property_address || 'N/A'}`);
                console.log(`   Cleaned Address: ${prop.cleaned_address || 'N/A'}`);
                console.log(`   ZIP Code: ${prop.zip_code || 'N/A'}`);
                console.log('');
            });
        }
        
        console.log('🎉 Enhanced SITUS parsing test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testSitusIntegration();
