const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite database
const db = new sqlite3.Database('properties.db');

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parcel_id TEXT UNIQUE,
        owner TEXT,
        property_address TEXT,
        cleaned_address TEXT,
        zip_code TEXT,
        tax_amount TEXT,
        latitude REAL,
        longitude REAL,
        geocoded INTEGER DEFAULT 0,
        has_photo INTEGER DEFAULT 0,
        photo_info TEXT,
        county TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

console.log('SITUS Parser Server starting...');

// Enhanced SITUS-based PDF parser
async function parseChathamPDF(pdfText) {
    console.log('🔍 Parsing PDF with SITUS field extraction...');
    
    // Split into lines and clean up
    const lines = pdfText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    console.log(`📄 Processing ${lines.length} lines of PDF text`);
    
    const parsedListings = [];
    const seenParcelIds = new Set();
    
    // The PDF has a table structure: PARCEL ID | OWNER | SITUS | STARTING BID
    // We need to parse this structure properly
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for parcel ID patterns
        let isParcelStart = false;
        let fullParcelId = line;
        
        // Pattern 1: Split parcel ID (10045 followed by 12032)
        if (/^\d{4,6}$/.test(line) && i + 1 < lines.length && /^\d{4,6}$/.test(lines[i + 1])) {
            // Skip if this is a zip code (5 digits starting with 3)
            if (line.length === 5 && line.startsWith('3')) {
                continue;
            }
            
            const nextLine = lines[i + 1];
            fullParcelId = line + '-' + nextLine;
            isParcelStart = true;
            i++; // Skip the next line
            console.log(`🆔 Found parcel ID: ${fullParcelId}`);
        }
        
        if (isParcelStart && !seenParcelIds.has(fullParcelId)) {
            seenParcelIds.add(fullParcelId);
            
            const listing = {
                parcelId: fullParcelId,
                property: fullParcelId,
                owner: '',
                address: '',
                cleanedAddress: '',
                zipCode: '',
                amount: '',
                taxAmount: ''
            };
            
            // Parse the table structure after the parcel ID
            let j = i + 1;
            let phase = 'owner'; // Start by collecting owner data
            let ownerParts = [];
            let situs = [];
            let foundSitusAddress = false;
            
            while (j < lines.length && j < i + 50) {
                const currentLine = lines[j];
                
                // Stop at next parcel ID
                if ((/^\d{4,6}$/.test(currentLine) && j + 1 < lines.length && /^\d{4,6}$/.test(lines[j + 1]) && !(currentLine.length === 5 && currentLine.startsWith('3')))) {
                    break;
                }
                
                // Look for the bid amount (decimal followed by $)
                if (currentLine === '$' && j > 0 && /^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(lines[j - 1])) {
                    listing.amount = '$' + lines[j - 1];
                    listing.taxAmount = listing.amount;
                    console.log(`💰 Found amount: ${listing.amount}`);
                    break;
                }
                
                // Detect SITUS address (clean address with house number, street, zip)
                // Look for: house number + street pattern + zip code
                if (/^\d{1,4}$/.test(currentLine) && !foundSitusAddress) {
                    // This might be the start of a SITUS address
                    let addressParts = [currentLine]; // Start with house number
                    let k = j + 1;
                    
                    // Collect street name parts
                    while (k < lines.length && k < j + 10) {
                        const part = lines[k];
                        if (!part || part === '$') break;
                        
                        addressParts.push(part);
                        
                        // If we hit a 5-digit number, it's likely the zip code
                        if (/^\d{5}$/.test(part)) {
                            const fullAddress = addressParts.join(' ');
                            
                            // Validate this looks like a real address
                            if (/^\d{1,4}\s+[A-Z\s]+(ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY)\s+\d{5}$/i.test(fullAddress)) {
                                listing.address = fullAddress;
                                listing.cleanedAddress = fullAddress;
                                listing.zipCode = part;
                                foundSitusAddress = true;
                                console.log(`🏠 Found SITUS address: ${fullAddress}`);
                                j = k; // Skip processed lines
                                break;
                            }
                        }
                        k++;
                    }
                    
                    if (!foundSitusAddress) {
                        // This wasn't a SITUS address, add to owner data
                        ownerParts.push(currentLine);
                    }
                } else if (!foundSitusAddress) {
                    // Collect owner data
                    ownerParts.push(currentLine);
                }
                
                j++;
            }
            
            // Clean up owner data
            listing.owner = ownerParts
                .filter(part => 
                    part && 
                    part.length > 0 && 
                    !part.includes('$') &&
                    !/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(part) // Not decimal amounts
                )
                .slice(0, 5) // Take first 5 parts for owner name
                .join(' ')
                .replace(/\s+/g, ' ') // Clean up extra spaces
                .trim();
            
            // If we didn't find a SITUS address but have owner data that might contain an address
            if (!foundSitusAddress && ownerParts.length > 0) {
                // Look for address-like patterns in the owner data
                const combinedText = ownerParts.join(' ');
                const addressMatch = combinedText.match(/(\d{1,4}\s+[A-Z\s]+(ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY)(?:\s+\d{5})?)/i);
                if (addressMatch) {
                    listing.address = addressMatch[1].trim();
                    listing.cleanedAddress = listing.address;
                    
                    // Extract zip code if present
                    const zipMatch = listing.address.match(/\b(\d{5})\b/);
                    if (zipMatch) {
                        listing.zipCode = zipMatch[1];
                    }
                    
                    console.log(`🏠 Extracted address from owner data: ${listing.address}`);
                }
            }
            
            // Only add if we have essential data
            if (listing.parcelId && (listing.address || listing.owner)) {
                parsedListings.push(listing);
                console.log(`✅ Added listing: ${listing.parcelId} - ${listing.address || 'No address'}`);
            }
        }
    }
    
    console.log(`📊 Parsed ${parsedListings.length} properties with SITUS extraction`);
    return parsedListings;
}

// Test endpoint
app.get('/test-situs', async (req, res) => {
    try {
        console.log('🧪 Testing SITUS parser...');
        
        // Download the PDF
        const pdfResponse = await fetch('https://cms.chathamcountyga.gov/api/assets/taxcommissioner/b4158c0d-58fe-4552-b715-e6f0f97c8520?download=0');
        const pdfBuffer = await pdfResponse.buffer();
        
        // Parse PDF
        const pdfData = await pdfParse(pdfBuffer);
        console.log('📄 PDF parsed, text length:', pdfData.text.length);
        
        // Extract properties using SITUS parser
        const properties = await parseChathamPDF(pdfData.text);
        
        res.json({
            success: true,
            count: properties.length,
            properties: properties.slice(0, 5), // Return first 5 for testing
            message: 'SITUS parser test completed'
        });
        
    } catch (error) {
        console.error('❌ SITUS parser test failed:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🚀 SITUS Parser Server running on http://localhost:${PORT}`);
    console.log('📝 Test the parser at: http://localhost:3002/test-situs');
});
