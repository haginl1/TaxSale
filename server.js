const express = require('express');
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Disable ETag caching for development
app.set('etag', false);

// Deployment timestamp: 2025-07-26 - Enhanced logging deployment
console.log('Starting server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', PORT);

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    
    next();
});

// Add body parser for JSON requests
app.use(express.json());

// Geocoding cache setup
const fs = require('fs');
const GEOCODE_CACHE_FILE = path.join(__dirname, 'geocode_cache.json');
let geocodeCache = {};

// Load existing geocode cache
function loadGeocodeCache() {
    try {
        if (fs.existsSync(GEOCODE_CACHE_FILE)) {
            const cacheData = fs.readFileSync(GEOCODE_CACHE_FILE, 'utf8');
            geocodeCache = JSON.parse(cacheData);
            console.log(`Loaded ${Object.keys(geocodeCache).length} cached geocode entries`);
        }
    } catch (error) {
        console.error('Error loading geocode cache:', error);
        geocodeCache = {};
    }
}

// Save geocode cache
function saveGeocodeCache() {
    try {
        fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2));
        console.log(`Saved ${Object.keys(geocodeCache).length} geocode entries to cache`);
    } catch (error) {
        console.error('Error saving geocode cache:', error);
    }
}

// Generate cache key for an address
function getCacheKey(address, zipCode) {
    return `${address.toLowerCase().trim()}_${zipCode || ''}`.replace(/[^a-z0-9_]/g, '_');
}

// Initialize geocode cache
loadGeocodeCache();

// Clean address for geocoding by removing legal descriptions
function cleanAddressForGeocoding(address) {
    if (!address || typeof address !== 'string') {
        return '';
    }
    
    let cleaned = address;
    
    // Remove common legal description patterns
    const legalPatterns = [
        /,?\s*said\s+property\s+being\s+formerly.*$/i,
        /,?\s*said\s+property.*$/i,
        /,?\s*being\s+formerly\s+in\s+the\s+name\s+of.*$/i,
        /,?\s*formerly\s+in\s+the\s+name\s+of.*$/i,
        /,?\s*in\s+rem\s+against\s+the\s+property\s+known\s+as\s+/i,
        /^in\s+rem\s*/i,
        /\s+in\s+rem.*$/i,
        /^lot\s+\d+.*?\s+(\d+\s+\w+.*?)$/i, // Extract address from "LOT 26 MISTWOODE SUB 17 RUSTIC LN"
        /^lots?\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^east\s+half\s+lot\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^west\s+half\s+lot\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^(east|west|north|south)\s+\d+\s+ft.*?\s+(\d+\s+\w+.*?)$/i,
        /^e\s+1\/2\s+lt\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^w\s+1\/2\s+lt\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^lts?\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /^lt\s+\d+.*?\s+(\d+\s+\w+.*?)$/i,
        /blk\s+\d+/i,
        /block\s+\d+/i,
        /sub\s*$/i,
        /s\/d\s*/i,
        /phase\s+\d+/i,
        /,\s*$/, // trailing comma
    ];
    
    // Apply each pattern
    for (const pattern of legalPatterns) {
        // Check if pattern has a capture group for extracting the address
        const match = cleaned.match(pattern);
        if (match && match[1]) {
            // Use the captured group (the actual address)
            cleaned = match[1].trim();
            break;
        } else {
            // Remove the pattern
            cleaned = cleaned.replace(pattern, '').trim();
        }
    }
    
    // Clean up extra spaces and formatting
    cleaned = cleaned
        .replace(/\s+/g, ' ') // Multiple spaces to single space
        .replace(/^\s*,\s*|\s*,\s*$/g, '') // Leading/trailing commas
        .replace(/^(and\s+|&\s+)/i, '') // Remove leading "and" or "&"
        .replace(/\s+(and\s+|&\s+).*$/i, '') // Remove everything after "and" or "&"
        .replace(/[‐–—]/g, '-') // Normalize dashes
        .trim();
    
    // If we have a reasonable street address pattern, keep it
    if (/^\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY|HIGHWAY)\b/i.test(cleaned)) {
        return cleaned;
    }
    
    // If we have just a house number and some text, keep it
    if (/^\d+\s+\w+/.test(cleaned) && cleaned.length > 5) {
        return cleaned;
    }
    
    // If the cleaned address is too short or doesn't look like an address, try to extract from original
    if (cleaned.length < 5) {
        // Try to extract a street address pattern from the original
        const addressMatch = address.match(/(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY|HIGHWAY))\b/i);
        if (addressMatch) {
            return addressMatch[1].trim();
        }
        
        // Try to extract any number followed by words pattern
        const basicMatch = address.match(/(\d+\s+[A-Z\s]{3,})/i);
        if (basicMatch) {
            return basicMatch[1].trim();
        }
    }
    
    return cleaned;
}

// Geocode a single address
async function geocodeSingleAddress(address, zipCode, county = 'Chatham County', state = 'GA') {
    // Clean the address first
    const cleanAddress = cleanAddressForGeocoding(address);
    
    if (cleanAddress.length <= 5) {
        console.log(`⚠️  Address too short after cleaning: "${address}" -> "${cleanAddress}"`);
        return { success: false, message: 'Address too short after cleaning' };
    }
    
    const cacheKey = getCacheKey(cleanAddress, zipCode);
    
    // Check cache first
    if (geocodeCache[cacheKey]) {
        return {
            success: true,
            coordinates: geocodeCache[cacheKey].coordinates,
            display_name: geocodeCache[cacheKey].display_name,
            cached: true
        };
    }
    
    try {
        const searchQuery = `${cleanAddress}, ${zipCode}, ${county}, ${state}, USA`;
        const encodedQuery = encodeURIComponent(searchQuery);
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodedQuery}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(nominatimUrl, {
            headers: { 'User-Agent': 'TaxSaleListings/1.0' },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const geocodeResults = await response.json();
            
            if (geocodeResults && geocodeResults.length > 0) {
                const result = geocodeResults[0];
                const coordinates = {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon)
                };
                
                // Cache the result
                geocodeCache[cacheKey] = {
                    coordinates: coordinates,
                    display_name: result.display_name,
                    cached_at: new Date().toISOString()
                };
                
                return {
                    success: true,
                    coordinates: coordinates,
                    display_name: result.display_name,
                    cached: false
                };
            }
        }
        
        return { success: false, message: 'No coordinates found' };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return { success: false, message: 'Request timeout' };
        }
        return { success: false, message: error.message };
    }
}

// Geocode all listings with rate limiting
async function geocodeAllListings(listings, county = 'Chatham County', state = 'GA') {
    console.log(`🗺️  Starting background geocoding for ${listings.length} properties...`);
    
    let geocoded = 0;
    let cached = 0;
    let failed = 0;
    
    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        
        try {
            const result = await geocodeSingleAddress(listing.address || '', listing.zipCode || '', county, state);
            
            if (result.success) {
                listing.coordinates = result.coordinates;
                listing.geocoded = true;
                listing.geocodeSource = result.cached ? 'cache' : 'nominatim';
                
                if (result.cached) {
                    cached++;
                } else {
                    geocoded++;
                    // Rate limiting: wait between API calls
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                console.log(`✅ Geocoded ${i + 1}/${listings.length}: ${listing.address} -> ${result.coordinates.lat}, ${result.coordinates.lng}`);
            } else {
                listing.coordinates = null;
                listing.geocoded = false;
                listing.geocodeError = result.message;
                failed++;
                console.log(`❌ Failed ${i + 1}/${listings.length}: ${listing.address} - ${result.message}`);
            }
        } catch (error) {
            listing.coordinates = null;
            listing.geocoded = false;
            listing.geocodeError = error.message;
            failed++;
            console.error(`❌ Error geocoding ${listing.address}:`, error.message);
        }
        
        // Progress update every 10 items
        if ((i + 1) % 10 === 0) {
            console.log(`🗺️  Progress: ${i + 1}/${listings.length} processed (${geocoded + cached} successful, ${failed} failed)`);
        }
    }
    
    // Save cache if we added new entries
    if (geocoded > 0) {
        saveGeocodeCache();
    }
    
    console.log(`🗺️  Geocoding complete: ${geocoded + cached}/${listings.length} successful (${cached} from cache, ${geocoded} new, ${failed} failed)`);
    
    return {
        total: listings.length,
        successful: geocoded + cached,
        fromCache: cached,
        newlyGeocoded: geocoded,
        failed: failed
    };
}

// Root route - serve the main application (must come before static middleware)
app.get('/', (req, res) => {
    console.log('Root route accessed');
    const filePath = path.join(__dirname, 'app.html');
    console.log('Sending file:', filePath);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Error loading application');
        }
    });
});

// Explicit route for app.html
app.get('/app.html', (req, res) => {
    console.log('App.html route accessed');
    const filePath = path.join(__dirname, 'app.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending app.html:', err);
            res.status(500).send('Error loading application');
        }
    });
});

// Serve static files (but not index.html at root)
app.use(express.static(path.join(__dirname, '.'), {
    index: false  // Prevent serving index.html automatically
}));

// County configurations
const COUNTY_CONFIGS = {
    chatham: {
        name: 'Chatham County',
        state: 'GA',
        dataType: 'pdf',
        url: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/55d1026b-bc1f-4f42-be4d-12893bff13d9?download=0',
        photoListUrl: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/678679b0-4664-4f96-8a68-a28ae08a63d8?download=0',
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
    console.log('Counties API endpoint accessed');
    try {
        const counties = Object.keys(COUNTY_CONFIGS).map(key => ({
            id: key,
            name: COUNTY_CONFIGS[key].name,
            state: COUNTY_CONFIGS[key].state,
            status: COUNTY_CONFIGS[key].status || 'active'
        }));
        console.log('Returning counties:', counties);
        res.json(counties);
    } catch (error) {
        console.error('Error in counties endpoint:', error);
        res.status(500).json({ error: 'Failed to load counties' });
    }
});

// Geocoding endpoint using OpenStreetMap Nominatim API
app.get('/api/geocode', async (req, res) => {
    const { address, county = 'Chatham County', state = 'GA' } = req.query;
    
    if (!address) {
        return res.status(400).json({ error: 'Address parameter required' });
    }
    
    try {
        // Construct search query for better accuracy
        const searchQuery = `${address}, ${county}, ${state}, USA`;
        const encodedQuery = encodeURIComponent(searchQuery);
        
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodedQuery}`;
        
        console.log('Geocoding request:', searchQuery);
        
        const response = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': 'TaxSaleListings/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Geocoding service error: ${response.status}`);
        }
        
        const results = await response.json();
        
        if (results && results.length > 0) {
            const result = results[0];
            res.json({
                success: true,
                coordinates: {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon)
                },
                display_name: result.display_name,
                address: searchQuery
            });
        } else {
            res.json({
                success: false,
                message: 'No coordinates found for address',
                address: searchQuery
            });
        }
        
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            address: address
        });
    }
});

// Batch geocoding endpoint for multiple addresses
app.post('/api/geocode-batch', async (req, res) => {
    console.log('Batch geocoding request received');
    console.log('Request body:', req.body);
    
    const { addresses, county = 'Chatham County', state = 'GA' } = req.body;
    
    if (!addresses || !Array.isArray(addresses)) {
        console.log('Invalid addresses array:', addresses);
        return res.status(400).json({ error: 'Addresses array required in request body' });
    }
    
    console.log(`Processing ${addresses.length} addresses for geocoding`);
    
    // Set a timeout for the entire operation (20 seconds)
    const timeoutMs = 20000;
    const startTime = Date.now();
    
    try {
        const results = [];
        
        // Reduced batch size for better performance and to avoid timeouts
        // Process max 20 addresses to stay under server timeout limits
        const maxAddresses = Math.min(addresses.length, 20);
        const addressesToProcess = addresses.slice(0, maxAddresses).map(addr => {
            // Clean and format addresses better
            return addr.replace(/\s+/g, ' ').trim();
        }).filter(addr => addr.length > 5); // Filter out very short addresses
        
        console.log(`Processing ${addressesToProcess.length} cleaned addresses (limited to ${maxAddresses})`);
        
        for (let i = 0; i < addressesToProcess.length; i++) {
            // Check if we're approaching timeout
            if (Date.now() - startTime > timeoutMs - 2000) { // Leave 2 seconds buffer
                console.log(`Stopping geocoding due to timeout approaching. Processed ${i}/${addressesToProcess.length}`);
                break;
            }
            
            const address = addressesToProcess[i];
            
            try {
                const searchQuery = `${address}, ${county}, ${state}, USA`;
                const encodedQuery = encodeURIComponent(searchQuery);
                
                const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodedQuery}`;
                
                console.log(`Geocoding ${i + 1}/${addressesToProcess.length}: ${address}`);
                
                // Add timeout to individual requests
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout per request
                
                const response = await fetch(nominatimUrl, {
                    headers: {
                        'User-Agent': 'TaxSaleListings/1.0'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const responseText = await response.text();
                    
                    try {
                        const geocodeResults = JSON.parse(responseText);
                        
                        if (geocodeResults && geocodeResults.length > 0) {
                            const result = geocodeResults[0];
                            results.push({
                                address: address,
                                success: true,
                                coordinates: {
                                    lat: parseFloat(result.lat),
                                    lng: parseFloat(result.lon)
                                },
                                display_name: result.display_name
                            });
                            console.log(`✅ Successfully geocoded: ${address}`);
                        } else {
                            results.push({
                                address: address,
                                success: false,
                                message: 'No coordinates found'
                            });
                            console.log(`❌ No results for: ${address}`);
                        }
                    } catch (parseError) {
                        console.error('JSON parse error for address:', address, 'Response:', responseText);
                        results.push({
                            address: address,
                            success: false,
                            message: 'Invalid response format'
                        });
                    }
                } else {
                    console.log(`❌ HTTP error ${response.status} for: ${address}`);
                    results.push({
                        address: address,
                        success: false,
                        message: `Service error: ${response.status}`
                    });
                }
                
                // Reduced delay to avoid timeouts while still being respectful
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.error(`❌ Timeout geocoding ${address}`);
                    results.push({
                        address: address,
                        success: false,
                        message: 'Request timeout'
                    });
                } else {
                    console.error(`❌ Error geocoding ${address}:`, error.message);
                    results.push({
                        address: address,
                        success: false,
                        message: error.message
                    });
                }
            }
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`Geocoding completed in ${processingTime}ms: ${results.filter(r => r.success).length}/${results.length} successful`);
        
        res.json({
            results: results,
            processed: results.length,
            total: addresses.length,
            successful: results.filter(r => r.success).length,
            limited: addresses.length > maxAddresses,
            processingTimeMs: processingTime
        });
        
    } catch (error) {
        console.error('Batch geocoding error:', error);
        res.status(500).json({
            error: error.message,
            processingTimeMs: Date.now() - startTime
        });
    }
});

// Endpoint to fetch and parse tax sale listings for different counties
app.get('/api/tax-sale-listings', async (req, res) => {
    // Default route - redirect to Chatham County
    const county = 'chatham';
    const config = COUNTY_CONFIGS[county];
    
    const dataUrl = config.url;
    
    try {
        console.log(`Fetching ${config.name} tax sale data from:`, dataUrl);
        return await parseChathamPdf(dataUrl, res, config);
    } catch (err) {
        res.status(500).json({ 
            error: err.message,
            county: config.name 
        });
    }
});

app.get('/api/tax-sale-listings/:county', async (req, res) => {
    const county = req.params.county || 'chatham'; // Default to Chatham County
    console.log(`Tax sale listings requested for county: ${county}`);
    
    // Disable caching
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    const config = COUNTY_CONFIGS[county];
    
    if (!config) {
        console.log(`Unsupported county requested: ${county}`);
        return res.status(400).json({ 
            error: 'Unsupported county', 
            availableCounties: Object.keys(COUNTY_CONFIGS) 
        });
    }
    
    console.log(`Configuration found for ${county}:`, config);
    
    // Check if county service is under maintenance
    if (config.status === 'maintenance') {
        console.log(`County ${county} is under maintenance`);
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
        console.error(`Error processing tax sale listings for ${county}:`, err);
        console.error('Error stack:', err.stack);
        
        res.status(500).json({ 
            error: err.message,
            county: config.name,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Chatham County PDF parser
async function parseChathamPdf(pdfUrl, res, config) {
    console.log(`Starting PDF parsing for ${config.name} from:`, pdfUrl);
    
    try {
        const response = await fetch(pdfUrl);
        
        if (!response.ok) {
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            console.error('PDF fetch failed:', errorMsg);
            throw new Error(errorMsg);
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

    // Fetch photo list if available
    let photoData = null;
    if (config.photoListUrl) {
        try {
            console.log('Fetching photo list from:', config.photoListUrl);
            const photoResponse = await fetch(config.photoListUrl);
            if (photoResponse.ok) {
                const photoBuffer = await photoResponse.buffer();
                photoData = await pdfParse(photoBuffer);
                console.log('Photo list parsing successful, text length:', photoData.text.length);
            }
        } catch (error) {
            console.log('Photo list fetch failed:', error.message);
        }
    }

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
            // Collect all lines for this property entry
            let allDataLines = [];
            let foundAmount = false;
            
            while (j < lines.length && j < i + 25) { // Look ahead max 25 lines
                const nextLine = lines[j];
                
                // Stop if we hit another parcel ID pattern
                if ((/^\d{5}[A-Z]\d{5}$/.test(nextLine)) || 
                    (/^\d{4,6}$/.test(nextLine) && j + 1 < lines.length && /^\d{4,6}$/.test(lines[j + 1]))) {
                    break;
                }
                
                currentListing.allLines.push(nextLine);
                allDataLines.push(nextLine);
                
                // Identify amount - handle both combined ($1234.56) and separate lines
                if (nextLine.includes('$') && /[\d,]+\.?\d*/.test(nextLine)) {
                    // Case 1: Dollar sign and amount on same line
                    const amountMatch = nextLine.match(/[\d,]+\.?\d*/);
                    if (amountMatch) {
                        currentListing.amount = '$' + amountMatch[0];
                        foundAmount = true;
                    }
                } else if (/^[\d,]+\.\d+$/.test(nextLine) && !foundAmount) {
                    // Case 2: Amount line without $ - typical pattern like "4,672.58"
                    currentListing.amount = '$' + nextLine;
                    foundAmount = true;
                }
                
                // Identify zip code (5 digits)
                if (/^\d{5}$/.test(nextLine)) {
                    currentListing.zipCode = nextLine;
                }
                
                j++;
            }
            
            // Parse owner and address from the collected lines
            if (allDataLines.length > 0) {
                console.log(`DEBUG: Processing parcel ${fullParcelId} with data:`, allDataLines);
                
                // Find the house number (first number that's not 5 digits)
                let houseNumberIndex = -1;
                let zipIndex = -1;
                
                for (let k = 0; k < allDataLines.length; k++) {
                    // Find house number (first number that's not a zip code)
                    if (/^\d+$/.test(allDataLines[k]) && !(/^\d{5}$/.test(allDataLines[k])) && houseNumberIndex === -1) {
                        houseNumberIndex = k;
                    }
                    // Find zip code
                    if (/^\d{5}$/.test(allDataLines[k])) {
                        zipIndex = k;
                    }
                }
                
                if (houseNumberIndex !== -1) {
                    // Owner name: everything before the house number
                    const rawOwnerParts = allDataLines.slice(0, houseNumberIndex);
                    const ownerParts = rawOwnerParts.filter(part => 
                        part.length > 0 && 
                        !part.includes('$') && 
                        !/^[\d,]+\.[\d,]+$/.test(part) // Only filter decimal amounts like "4,672.58"
                    );
                    currentListing.owner = ownerParts.slice(0, 4).join(' ');
                    
                    // Address: from house number to zip code (or end if no zip)
                    const addressEndIndex = zipIndex !== -1 ? zipIndex : allDataLines.length;
                    const rawAddressParts = allDataLines.slice(houseNumberIndex, addressEndIndex);
                    const addressParts = rawAddressParts.filter(part => 
                        part.length > 0 && 
                        !part.includes('$') && 
                        !/^[\d,]+\.[\d,]+$/.test(part) && // Only filter decimal amounts like "4,672.58", not house numbers
                        !/^\d{5}$/.test(part) // Not zip code
                    );
                    currentListing.address = addressParts.join(' ');
                } else {
                    // Fallback: if no house number found, split roughly in half
                    const splitPoint = Math.floor(allDataLines.length / 2);
                    const ownerParts = allDataLines.slice(0, splitPoint).filter(part => 
                        part.length > 0 && !part.includes('$') && !/^[\d,]+\.[\d,]+$/.test(part)
                    );
                    const addressParts = allDataLines.slice(splitPoint).filter(part => 
                        part.length > 0 && !part.includes('$') && !/^[\d,]+\.[\d,]+$/.test(part) && !/^\d{5}$/.test(part)
                    );
                    
                    currentListing.owner = ownerParts.slice(0, 4).join(' ');
                    currentListing.address = addressParts.join(' ');
                }
            }
            
            // Skip processed lines
            i = j - 1;
        }
    }
    
    // Add the last listing
    if (Object.keys(currentListing).length > 0) {
        parsedListings.push(currentListing);
    }

    // Parse photo list and correlate with parcel IDs
    const photoMap = {};
    if (photoData) {
        const photoLines = photoData.text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        console.log('Photo list has', photoLines.length, 'lines');
        
        // Parse the photo list structure and estimate page numbers
        // Each property typically takes about 8-12 lines in the PDF including the photo
        let estimatedPage = 1;
        let linesSinceLastHeader = 0;
        const linesPerPage = 25; // Estimate based on PDF structure
        
        for (let i = 0; i < photoLines.length; i++) {
            const line = photoLines[i];
            linesSinceLastHeader++;
            
            // Check for page headers to reset page counting
            if (line.includes('Chatham County Tax Commissioner Office') || 
                line.includes('Tax Sale – August 5, 2025')) {
                if (linesSinceLastHeader > 10) { // Only count as new page if enough lines have passed
                    estimatedPage++;
                }
                linesSinceLastHeader = 0;
                continue;
            }
            
            // Look for lines with parcel ID and starting bid format
            const parcelBidMatch = line.match(/^(\d{5}[\s-]?\d{5}|\d{5}[A-Z]\d{5}|\d{4,6}[\s-]\d{4,6})\s*\/\s*STARTING\s+BID\s+\$[\d,]+\.?\d*/i);
            
            if (parcelBidMatch) {
                let parcelId = parcelBidMatch[1].replace(/\s+/g, '-'); // Normalize spacing to dashes
                
                // If it's the format "10045 12032", convert to "10045-12032"
                if (/^\d{4,6}\s\d{4,6}$/.test(parcelBidMatch[1])) {
                    parcelId = parcelBidMatch[1].replace(/\s+/g, '-');
                }
                
                console.log(`Found parcel with photo: ${parcelId} (estimated page ${estimatedPage})`);
                
                // Get owner/address info from next line if available
                let ownerAddress = '';
                if (i + 1 < photoLines.length) {
                    const nextLine = photoLines[i + 1];
                    // Check if next line doesn't start with parcel ID pattern
                    if (!nextLine.match(/^\d{4,6}/) && !nextLine.includes('Chatham County')) {
                        ownerAddress = nextLine;
                    }
                }
                
                // Since this property is in the photo list, it HAS a photo
                photoMap[parcelId] = {
                    hasPhoto: true,
                    photoInfo: 'Property photo available in official Photo List PDF',
                    ownerAddress: ownerAddress,
                    bidAmount: line.match(/\$[\d,]+\.?\d*/)?.[0] || '',
                    estimatedPage: estimatedPage,
                    linePosition: i
                };
                
                console.log(`Added photo data for parcel ${parcelId}:`, photoMap[parcelId]);
            }
        }
    }

    // Add photo references to listings and copy amounts
    parsedListings.forEach(listing => {
        if (photoMap[listing.parcelId]) {
            listing.photoData = photoMap[listing.parcelId];
            listing.hasPhotos = true;
            // Copy amount from photoData if main parsing didn't capture it
            if ((!listing.amount || listing.amount === '') && listing.photoData.bidAmount) {
                listing.amount = listing.photoData.bidAmount;
            }
        } else {
            listing.photoData = null;
            listing.hasPhotos = false;
        }
    });
    
    // Geocode all listings before returning them
    console.log(`🗺️  Starting background geocoding for ${parsedListings.length} properties...`);
    const geocodeStats = await geocodeAllListings(parsedListings, config.name, 'GA');
    
    res.json({ 
        rawLines: lines,
        parsedListings: parsedListings,
        totalListings: parsedListings.length,
        originalText: rawText.substring(0, 500) + '...', // First 500 chars for debugging
        pdfUrl: pdfUrl, // Include the PDF URL so frontend can show the correct link
        photoListUrl: config.photoListUrl,
        county: config.name,
        geocodeStats: geocodeStats, // Include geocoding statistics
        metadata: {
            processedAt: new Date().toISOString(),
            pdfSize: buffer.length,
            textLength: data.text.length,
            totalLines: lines.length,
            pdfPages: data.numpages,
            pdfInfo: data.info,
            photoListAvailable: photoData !== null,
            photoListSize: photoData ? photoData.text.length : 0,
            propertiesWithPhotos: parsedListings.filter(l => l.hasPhotos).length,
            totalPhotoReferences: Object.keys(photoMap).length,
            geocodedProperties: geocodeStats.successful,
            geocodingDetails: `${geocodeStats.successful}/${geocodeStats.total} properties geocoded (${geocodeStats.fromCache} from cache, ${geocodeStats.newlyGeocoded} new)`,
            taxSaleDate: "Tuesday, August 05, 2025",
            lastUpdated: "July 25, 2025",
            source: `Official ${config.name} Tax Commissioner - August 2025 Tax Sale List`,
            note: "✅ This is the current official tax sale list from tax.chathamcountyga.gov/TaxSaleList"
        }
    });
    } catch (error) {
        console.error('Error in parseChathamPdf:', error);
        throw error;
    }
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    console.log('404 - Route not found:', req.url);
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Available counties:', Object.keys(COUNTY_CONFIGS));
    console.log('Serving files from:', __dirname);
});
