const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('properties.db');

console.log('🔍 Checking current database addresses...');

db.all('SELECT parcel_id, property_address, cleaned_address, zip_code FROM properties LIMIT 5;', [], (err, rows) => {
    if (err) {
        console.error('Error:', err.message);
        return;
    }
    
    console.log('\n📍 Current database addresses:');
    rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.parcel_id}`);
        console.log(`   Original: ${row.property_address}`);  
        console.log(`   Cleaned: ${row.cleaned_address}`);
        console.log(`   Zip: ${row.zip_code}`);
        console.log('');
    });
    
    console.log('\n🎯 Expected SITUS addresses (what we should get):');
    console.log('1. 10045-12032: "7205 W SUGAR TREE CT 31410"');
    console.log('2. 10788-04113: "108 BLAINE CT 31405"'); 
    console.log('3. 20043-14010: "524 E PARK AVE 31401"');
    console.log('4. 20058-11002: "2148 ALASKA ST 31404"');
    console.log('5. 20064-35016: "534 SEILER AVE 31401"');
    
    db.close();
});
