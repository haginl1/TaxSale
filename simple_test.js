const http = require('http');

function testAPI() {
    console.log('🔄 Testing API connection...');
    
    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/properties/chatham',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const req = http.request(options, (res) => {
        console.log(`✅ Connected! Status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                console.log(`\n📊 Got ${result.properties ? result.properties.length : 0} properties`);
                
                if (result.properties && result.properties.length > 0) {
                    console.log('\n🏠 Enhanced SITUS parsing results:');
                    result.properties.slice(0, 3).forEach((prop, i) => {
                        console.log(`${i + 1}. Address: ${prop.property_address}`);
                        console.log(`   Cleaned: ${prop.cleaned_address}`);
                        console.log(`   ZIP: ${prop.zip_code}`);
                        console.log('');
                    });
                }
            } catch (e) {
                console.log('Raw response:', data.substring(0, 200));
            }
        });
    });
    
    req.on('error', (err) => {
        console.error('❌ Request failed:', err.message);
    });
    
    req.setTimeout(30000, () => {
        console.error('❌ Request timeout');
        req.destroy();
    });
    
    req.end();
}

// Wait a moment for server to be ready
setTimeout(testAPI, 2000);
