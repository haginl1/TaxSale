const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkDatabaseDirect() {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, 'properties.db');
        const db = new sqlite3.Database(dbPath);
        
        console.log('=== DATABASE INSPECTION ===\n');
        
        // Check PDF files table
        db.all("SELECT filename, file_hash, processed_at FROM pdf_files ORDER BY processed_at DESC LIMIT 5", (err, rows) => {
            if (err) {
                console.error('Error querying pdf_files:', err);
                return;
            }
            
            console.log('Recent PDF files:');
            rows.forEach(row => {
                console.log(`  File: ${row.filename}`);
                console.log(`  Hash: ${row.file_hash}`);
                console.log(`  Processed: ${row.processed_at}`);
                console.log('  ---');
            });
            
            // Check properties count
            db.get("SELECT COUNT(*) as count FROM properties", (err, row) => {
                if (err) {
                    console.error('Error counting properties:', err);
                    return;
                }
                
                console.log(`\nTotal properties: ${row.count}`);
                
                if (row.count > 0) {
                    // Get a sample property
                    db.get("SELECT * FROM properties LIMIT 1", (err, property) => {
                        if (err) {
                            console.error('Error getting sample property:', err);
                            return;
                        }
                        
                        console.log('\nSample property:');
                        console.log(JSON.stringify(property, null, 2));
                        
                        db.close();
                        resolve();
                    });
                } else {
                    db.close();
                    resolve();
                }
            });
        });
    });
}

checkDatabaseDirect().catch(console.error);
