const PropertyDatabase = require('./database');
const fs = require('fs');
const path = require('path');

async function forceClearAndTest() {
    try {
        console.log('=== FORCING SYSTEM RESET ===');
        
        const db = new PropertyDatabase();
        
        // Clear all data from database
        console.log('1. Clearing all database data...');
        await db.clearAllData();
        console.log('✅ Database cleared');
        
        // Delete the database file entirely to force recreation
        const dbPath = path.join(__dirname, 'properties.db');
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
            console.log('✅ Database file deleted');
        }
        
        // Clear geocode cache
        const geocodePath = path.join(__dirname, 'geocode_cache.json');
        if (fs.existsSync(geocodePath)) {
            fs.unlinkSync(geocodePath);
            console.log('✅ Geocode cache cleared');
        }
        
        console.log('\n=== SYSTEM RESET COMPLETE ===');
        console.log('Now restart the server and test with forceRefresh=true');
        console.log('URL to test: http://localhost:3002/api/tax-sale-listings/chatham?forceRefresh=true');
        
    } catch (error) {
        console.error('Error during reset:', error);
    }
}

forceClearAndTest();
