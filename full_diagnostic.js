const PropertyDatabase = require('./database');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const crypto = require('crypto');

async function fullDiagnostic() {
    console.log('=== TAX SALE SYSTEM DIAGNOSTIC ===\n');
    
    // Step 1: Check current URLs from website
    console.log('1. CHECKING CURRENT URLS FROM WEBSITE');
    console.log('-----------------------------------');
    
    try {
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let currentTaxSaleUrl = null;
        let currentPhotoUrl = null;
        
        $('a').each((i, element) => {
            const linkText = $(element).text().trim();
            const href = $(element).attr('href');
            
            if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                if (linkText.toLowerCase().includes('tax sale list') && !linkText.toLowerCase().includes('photo')) {
                    currentTaxSaleUrl = href;
                } else if (linkText.toLowerCase().includes('tax sale photo list')) {
                    currentPhotoUrl = href;
                }
            }
        });
        
        console.log(`✅ Current Tax Sale URL: ${currentTaxSaleUrl}`);
        console.log(`✅ Current Photo URL: ${currentPhotoUrl}`);
        
        // Step 2: Download and hash current PDF
        console.log('\n2. DOWNLOADING CURRENT PDF');
        console.log('---------------------------');
        
        if (currentTaxSaleUrl) {
            const pdfResponse = await fetch(currentTaxSaleUrl);
            if (pdfResponse.ok) {
                const currentPdfBuffer = await pdfResponse.buffer();
                const currentPdfHash = crypto.createHash('sha256').update(currentPdfBuffer).digest('hex');
                
                console.log(`✅ Current PDF downloaded: ${currentPdfBuffer.length} bytes`);
                console.log(`✅ Current PDF hash: ${currentPdfHash}`);
                
                // Step 3: Check what's in database
                console.log('\n3. CHECKING DATABASE CONTENTS');
                console.log('------------------------------');
                
                const db = new PropertyDatabase();
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for DB init
                
                const dbCheck = await new Promise((resolve, reject) => {
                    db.db.all('SELECT filename, file_hash, upload_date FROM pdf_files ORDER BY upload_date DESC LIMIT 3', (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                
                console.log('Database PDF files:');
                dbCheck.forEach(row => {
                    console.log(`  - ${row.filename}: ${row.file_hash} (${row.upload_date})`);
                });
                
                // Step 4: Check if current PDF hash matches any in database
                console.log('\n4. HASH COMPARISON');
                console.log('------------------');
                
                const matchingHash = dbCheck.find(row => row.file_hash === currentPdfHash);
                if (matchingHash) {
                    console.log(`❌ ISSUE FOUND: Current PDF hash ${currentPdfHash.substring(0, 16)}... matches database record from ${matchingHash.upload_date}`);
                    console.log('   This means the system thinks the PDF hasn\'t changed.');
                } else {
                    console.log(`✅ Current PDF hash ${currentPdfHash.substring(0, 16)}... is NEW - not in database`);
                    console.log('   System should process this as a new file.');
                }
                
                // Step 5: Check property count
                const propertyCount = await new Promise((resolve, reject) => {
                    db.db.get('SELECT COUNT(*) as count FROM properties', (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    });
                });
                
                console.log('\n5. CURRENT DATA STATUS');
                console.log('----------------------');
                console.log(`Properties in database: ${propertyCount}`);
                
                // Step 6: Recommendation
                console.log('\n6. RECOMMENDATION');
                console.log('-----------------');
                
                if (matchingHash) {
                    console.log('❌ PROBLEM: System has cached the current PDF and won\'t reprocess it.');
                    console.log('💡 SOLUTION: Clear the database or use forceRefresh=true');
                    console.log('   Run: DELETE FROM pdf_files; DELETE FROM properties;');
                } else {
                    console.log('✅ System should process the current PDF when requested.');
                    console.log('💡 Test with: http://localhost:3001/api/tax-sale-listings/chatham?forceRefresh=true');
                }
                
            } else {
                console.log(`❌ Failed to download PDF: ${pdfResponse.status}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
    }
}

fullDiagnostic();
