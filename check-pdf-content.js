// Simple PDF Content Check
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');

async function checkPdfContent() {
    try {
        console.log('📄 Downloading PDF from current URL...');
        const url = 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/b4158c0d-58fe-4552-b715-e6f0f97c8520?download=0';
        
        const response = await fetch(url);
        const buffer = await response.buffer();
        
        console.log(`📊 PDF Size: ${Math.round(buffer.length/1024)} KB`);
        
        console.log('📖 Parsing PDF content...');
        const data = await pdfParse(buffer);
        
        console.log(`📑 Pages: ${data.numpages}`);
        console.log(`📝 Text Length: ${data.text.length} characters`);
        
        // Look for property patterns
        const lines = data.text.split('\n').filter(line => line.trim());
        console.log(`📋 Total Lines: ${lines.length}`);
        
        // Count potential properties by looking for common patterns
        let propertyCount = 0;
        let sampleProperties = [];
        
        lines.forEach((line, index) => {
            // Look for lines that might be property addresses
            if (line.match(/^\d+\s+[A-Z]/i) && line.length > 10 && line.length < 100) {
                propertyCount++;
                if (sampleProperties.length < 10) {
                    sampleProperties.push(line.trim());
                }
            }
        });
        
        console.log(`\n🏠 Potential Properties Found: ${propertyCount}`);
        console.log('\n📋 Sample Properties:');
        sampleProperties.forEach((prop, i) => {
            console.log(`  ${i+1}. ${prop}`);
        });
        
        // Show first 1000 characters of the PDF text for analysis
        console.log('\n📄 First 1000 characters:');
        console.log(data.text.substring(0, 1000));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkPdfContent();
