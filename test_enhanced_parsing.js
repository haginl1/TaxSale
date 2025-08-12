const fetch = require('node-fetch');

console.log('🧪 Testing enhanced address extraction...');

fetch('http://localhost:3001/api/properties/chatham')
  .then(response => response.json())
  .then(data => {
    console.log('✅ API call successful');
    console.log('Properties found:', data.properties ? data.properties.length : 0);
    console.log('Message:', data.message);
    
    if (data.properties && data.properties.length > 0) {
      console.log('\n📍 First 3 properties with enhanced parsing:');
      data.properties.slice(0, 3).forEach((prop, i) => {
        console.log(`${i + 1}. ${prop.parcelId}`);
        console.log(`   Address: ${prop.address}`);
        console.log(`   Cleaned: ${prop.cleanedAddress}`);
        console.log(`   Zip: ${prop.zipCode}`);
        console.log('');
      });
      
      console.log('\n🎯 Expected SITUS results:');
      console.log('1. 10045-12032: "7205 W SUGAR TREE CT 31410"');
      console.log('2. 10788-04113: "108 BLAINE CT 31405"');
      console.log('3. 20043-14010: "524 E PARK AVE 31401"');
    }
  })
  .catch(err => console.error('❌ Error:', err.message));
