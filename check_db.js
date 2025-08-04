const PropertyDatabase = require('./database');

async function checkDatabase() {
    try {
        const db = new PropertyDatabase();
        
        // Check what files are tracked
        const query = `SELECT filename, file_hash, processed_at FROM pdf_files ORDER BY processed_at DESC LIMIT 5`;
        const result = await db.db.all(query);
        
        console.log('Recent PDF files in database:');
        result.forEach(row => {
            console.log(`  File: ${row.filename}`);
            console.log(`  Hash: ${row.file_hash}`);
            console.log(`  Processed: ${row.processed_at}`);
            console.log('  ---');
        });
        
        // Check total properties
        const properties = await db.getAllProperties();
        console.log(`\nTotal properties in database: ${properties.length}`);
        
        if (properties.length > 0) {
            console.log('Sample property:', JSON.stringify(properties[0], null, 2));
        }
        
    } catch (error) {
        console.error('Database check failed:', error);
    }
}

checkDatabase();
