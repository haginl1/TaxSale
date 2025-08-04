const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function checkDatabase() {
    const dbPath = path.join(__dirname, 'properties.db');
    console.log('=== DATABASE STATUS CHECK ===');
    console.log(`Database path: ${dbPath}`);
    
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Database connection failed:', err.message);
            return;
        }
        
        console.log('✅ Connected to database');
        
        // Check PDF files
        db.all('SELECT filename, file_hash, upload_date FROM pdf_files ORDER BY upload_date DESC', (err, rows) => {
            if (err) {
                console.error('❌ Error querying pdf_files:', err.message);
                return;
            }
            
            console.log('\n📄 PDF Files in database:');
            if (rows.length === 0) {
                console.log('  (none)');
            } else {
                rows.forEach(row => {
                    console.log(`  - ${row.filename}`);
                    console.log(`    Hash: ${row.file_hash.substring(0, 16)}...`);
                    console.log(`    Date: ${row.upload_date}`);
                    console.log('');
                });
            }
            
            // Check properties count
            db.get('SELECT COUNT(*) as count FROM properties', (err, row) => {
                if (err) {
                    console.error('❌ Error counting properties:', err.message);
                } else {
                    console.log(`🏠 Properties in database: ${row.count}`);
                }
                
                db.close();
            });
        });
    });
}

checkDatabase();
