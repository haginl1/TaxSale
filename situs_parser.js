// Enhanced SITUS-based PDF parser function
// This function extracts clean addresses from the SITUS field instead of messy legal descriptions

function parsePDFWithSITUS(pdfText) {
    console.log('🔍 Enhanced SITUS parsing starting...');
    
    const lines = pdfText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    console.log(`📄 Processing ${lines.length} lines of PDF text with SITUS extraction`);
    
    const parsedListings = [];
    const seenParcelIds = new Set();
    
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
        // Pattern 2: Complete parcel ID in one line (like 10115A03001)
        else if (/^\d{5}[A-Z]\d{5}$/.test(line) || /^\d{4,6}[\-\.]\d{2,4}[\-\.]\d{3,4}$/.test(line)) {
            isParcelStart = true;
            console.log(`🆔 Found complete parcel ID: ${line}`);
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
            let ownerParts = [];
            let foundSitusAddress = false;
            
            while (j < lines.length && j < i + 50) {
                const currentLine = lines[j];
                
                // Stop at next parcel ID
                if ((/^\d{4,6}$/.test(currentLine) && j + 1 < lines.length && /^\d{4,6}$/.test(lines[j + 1]) && !(currentLine.length === 5 && currentLine.startsWith('3'))) ||
                    /^\d{5}[A-Z]\d{5}$/.test(currentLine) || /^\d{4,6}[\-\.]\d{2,4}[\-\.]\d{3,4}$/.test(currentLine)) {
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
                if (/^\d{1,4}$/.test(currentLine) && !foundSitusAddress) {
                    let addressParts = [currentLine];
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
                                listing.cleanedAddress = fullAddress.replace(/\s+\d{5}$/, ''); // Remove zip from cleaned version
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
                        ownerParts.push(currentLine);
                    }
                } else if (!foundSitusAddress) {
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
                    !/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(part)
                )
                .slice(0, 5)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            // Fallback: look for address patterns in owner data if no SITUS found
            if (!foundSitusAddress && ownerParts.length > 0) {
                const combinedText = ownerParts.join(' ');
                const addressMatch = combinedText.match(/(\d{1,4}\s+[A-Z\s]+(ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY)(?:\s+\d{5})?)/i);
                if (addressMatch) {
                    listing.address = addressMatch[1].trim();
                    listing.cleanedAddress = addressMatch[1].trim().replace(/\s+\d{5}$/, '');
                    
                    const zipMatch = listing.address.match(/\b(\d{5})\b/);
                    if (zipMatch) {
                        listing.zipCode = zipMatch[1];
                    }
                    
                    console.log(`🏠 Extracted address from owner data: ${listing.address}`);
                }
            }
            
            if (listing.parcelId && (listing.address || listing.owner)) {
                parsedListings.push(listing);
                console.log(`✅ Added listing: ${listing.parcelId} - ${listing.address || 'No address'}`);
            }
            
            i = j - 1;
        }
    }
    
    console.log(`📊 SITUS parser completed: ${parsedListings.length} properties parsed`);
    return parsedListings;
}

module.exports = parsePDFWithSITUS;
