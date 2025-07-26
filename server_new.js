const express = require('express');
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = 3001;

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// County configurations
const COUNTY_CONFIGS = {
    chatham: {
        name: 'Chatham County',
        state: 'GA',
        dataType: 'pdf',
        url: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/55d1026b-bc1f-4f42-be4d-12893bff13d9?download=0',
        parser: 'chathamPdfParser'
    },
    dekalb: {
        name: 'DeKalb County',
        state: 'GA',
        dataType: 'csv',
        url: 'https://publicaccess.dekalbtax.org/forms/htmlframe.aspx?mode=content/search/tax_sale_listing.html',
        parser: 'dekalbCsvParser',
        status: 'maintenance' // System offline until Aug 2
    }
};

// Endpoint to get available counties
app.get('/api/counties', (req, res) => {
    const counties = Object.keys(COUNTY_CONFIGS).map(key => ({
        id: key,
        name: COUNTY_CONFIGS[key].name,
        state: COUNTY_CONFIGS[key].state,
        status: COUNTY_CONFIGS[key].status || 'active'
    }));
    res.json(counties);
});

// Endpoint to fetch and parse tax sale listings for different counties
app.get('/api/tax-sale-listings/:county?', async (req, res) => {
    const county = req.params.county || 'chatham'; // Default to Chatham County
    const config = COUNTY_CONFIGS[county];
    
    if (!config) {
        return res.status(400).json({ 
            error: 'Unsupported county', 
            availableCounties: Object.keys(COUNTY_CONFIGS) 
        });
    }
    
    // Check if county service is under maintenance
    if (config.status === 'maintenance') {
        return res.status(503).json({
            error: 'Service temporarily unavailable',
            message: `${config.name} tax sale listings are currently under maintenance`,
            availableCounties: Object.keys(COUNTY_CONFIGS).filter(c => COUNTY_CONFIGS[c].status !== 'maintenance')
        });
    }
    
    const dataUrl = config.url;
    
    try {
        console.log(`Fetching ${config.name} tax sale data from:`, dataUrl);
        
        if (config.dataType === 'pdf') {
            return await parseChathamPdf(dataUrl, res, config);
        } else if (config.dataType === 'csv') {
            return await parseDekalbCsv(dataUrl, res, config);
        } else {
            throw new Error(`Unsupported data type: ${config.dataType}`);
        }
    } catch (err) {
        res.status(500).json({ 
            error: err.message,
            county: config.name 
        });
    }
});

// Chatham County PDF parser
async function parseChathamPdf(pdfUrl, res, config) {
    const response = await fetch(pdfUrl);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('PDF fetch successful, status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content-Length:', response.headers.get('content-length'));
    
    const buffer = await response.buffer();
    console.log('Buffer size:', buffer.length);
    
    const data = await pdfParse(buffer);
    console.log('PDF parsing successful, text length:', data.text.length);
    console.log('PDF info:', data.info);
    console.log('Number of pages:', data.numpages);
    console.log('First 200 chars:', data.text.substring(0, 200));
    console.log('Last 200 chars:', data.text.substring(data.text.length - 200));

    // Improved parsing for tax sale data
    const rawText = data.text;
    
    // Split into lines and clean up
    const lines = rawText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    // Enhanced parsing for better structure
    const parsedListings = [];
    let currentListing = {};
    
    // Look for patterns that indicate new property listings
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this looks like a parcel ID - various patterns:
        // Single patterns: 10115A03001, or first part of split: 10045 followed by 12032
        let isParcelStart = false;
        let fullParcelId = line;
        
        // Pattern 1: Complete parcel ID in one line (like 10115A03001)
        if (/^\d{5}[A-Z]\d{5}$/.test(line) || /^\d{4,6}[\-\.]\d{2,4}[\-\.]\d{3,4}$/.test(line)) {
            isParcelStart = true;
        }
        // Pattern 2: First part of split parcel ID (4-6 digits followed by another 4-6 digits on next line)
        else if (/^\d{4,6}$/.test(line) && i + 1 < lines.length && /^\d{4,6}$/.test(lines[i + 1])) {
            // Check if the next line is also digits (second part of parcel ID)
            fullParcelId = line + '-' + lines[i + 1];
            isParcelStart = true;
            i++; // Skip the next line since we've processed it
        }
        
        if (isParcelStart) {
            
            // Save previous listing if it exists
            if (Object.keys(currentListing).length > 0) {
                parsedListings.push({...currentListing});
            }
            
            // Start new listing with enhanced parsing
            currentListing = {
                parcelId: fullParcelId,
                owner: '',
                address: '',
                zipCode: '',
                amount: '',
                rawData: [fullParcelId],
                allLines: []
            };
            
            // Look ahead to gather related data
            let j = i + 1;
            let ownerParts = [];
            let addressParts = [];
            let foundAmount = false;
            
            while (j < lines.length && j < i + 25) { // Look ahead max 25 lines
                const nextLine = lines[j];
                
                // Stop if we hit another parcel ID pattern
                if ((/^\d{5}[A-Z]\d{5}$/.test(nextLine)) || 
                    (/^\d{4,6}$/.test(nextLine) && j + 1 < lines.length && /^\d{4,6}$/.test(lines[j + 1]))) {
                    break;
                }
                
                currentListing.allLines.push(nextLine);
                
                // Identify amount (contains $ and numbers)
                if (nextLine.includes('$') && /[\d,]+\.?\d*/.test(nextLine)) {
                    const amountMatch = nextLine.match(/[\d,]+\.?\d*/);
                    if (amountMatch) {
                        currentListing.amount = '$' + amountMatch[0];
                        foundAmount = true;
                    }
                }
                
                // Identify zip code (5 digits)
                if (/^\d{5}$/.test(nextLine)) {
                    currentListing.zipCode = nextLine;
                }
                
                // Identify address parts (numbers + street words)
                if (/^\d+$/.test(nextLine) || /^(ST|AVE|DR|RD|CT|CIR|LN|WAY|BLVD|STREET|AVENUE|DRIVE|ROAD|COURT|CIRCLE|LANE)$/i.test(nextLine)) {
                    addressParts.push(nextLine);
                }
                
                // Collect potential owner names (alphabetic words, but not street types)
                if (/^[A-Z]+$/.test(nextLine) && 
                    !/^(ST|AVE|DR|RD|CT|CIR|LN|WAY|BLVD|STREET|AVENUE|DRIVE|ROAD|COURT|CIRCLE|LANE)$/i.test(nextLine) &&
                    !foundAmount && 
                    nextLine.length > 1) {
                    ownerParts.push(nextLine);
                }
                
                j++;
            }
            
            // Assemble owner name (first few alphabetic parts)
            if (ownerParts.length > 0) {
                currentListing.owner = ownerParts.slice(0, 4).join(' ');
            }
            
            // Assemble address
            if (addressParts.length > 0) {
                currentListing.address = addressParts.join(' ');
            }
            
            // Skip processed lines
            i = j - 1;
        }
    }
    
    // Add the last listing
    if (Object.keys(currentListing).length > 0) {
        parsedListings.push(currentListing);
    }
    
    res.json({ 
        rawLines: lines,
        parsedListings: parsedListings,
        totalListings: parsedListings.length,
        originalText: rawText.substring(0, 500) + '...', // First 500 chars for debugging
        pdfUrl: pdfUrl, // Include the PDF URL so frontend can show the correct link
        county: config.name,
        metadata: {
            processedAt: new Date().toISOString(),
            pdfSize: buffer.length,
            textLength: data.text.length,
            totalLines: lines.length,
            pdfPages: data.numpages,
            pdfInfo: data.info,
            taxSaleDate: "Tuesday, August 05, 2025",
            lastUpdated: "July 25, 2025",
            source: `Official ${config.name} Tax Commissioner - August 2025 Tax Sale List`,
            note: "✅ This is the current official tax sale list from tax.chathamcountyga.gov/TaxSaleList"
        }
    });
}

// DeKalb County CSV parser (placeholder for when system comes back online)
async function parseDekalbCsv(csvUrl, res, config) {
    // This is a placeholder for DeKalb County CSV parsing
    // Will be implemented when their system comes back online after Aug 2
    res.json({
        error: 'DeKalb County system under maintenance',
        message: 'DeKalb County tax sale listings are currently offline for system maintenance until August 2, 2025',
        county: config.name,
        metadata: {
            processedAt: new Date().toISOString(),
            source: `${config.name} Tax Commissioner`,
            note: "System under maintenance - will be available after August 2, 2025"
        }
    });
}

app.use(express.static('TaxSale')); // Serve your frontend

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Available counties:', Object.keys(COUNTY_CONFIGS));
});
