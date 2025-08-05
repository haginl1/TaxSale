// Tax Sale System with Dynamic URL Fetching - Deploy: Aug 4, 2025 (Sync Update)
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const pdf2pic = require('pdf2pic');
const PropertyDatabase = require('./database');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const db = new PropertyDatabase();

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
const GEOCODE_CACHE_FILE = path.join(__dirname, 'geocode_cache.json');
let geocodeCache = {};

// Load existing geocode cache
function loadGeocodeCache() {
    try {
        if (fsSync.existsSync(GEOCODE_CACHE_FILE)) {
            const cacheData = fsSync.readFileSync(GEOCODE_CACHE_FILE, 'utf8');
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
        fsSync.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2));
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
        return { cleaned: '', zipCode: null };
    }
    
    let cleaned = address;
    console.log(`🧹 Cleaning address: "${address}"`);
    
    // Extract zip code if it's embedded in the address before cleaning
    let extractedZipCode = null;
    const zipPatterns = [
        /(\d{5})(?:\s*,?\s*(?:said|SAID)\s+property\s+being)/i,  // Zip followed by "said property being"
        /(\d{5})(?:\s*,?\s*(?:said|SAID)\s+property)/i,  // Zip followed by "said property"
        /(\d{5})(?:\s*,?\s*(?:said|SAID))/i,  // Zip followed by "said"
        /(\d{5})\s*,?\s*$/,  // Zip at end of line
        /\b(\d{5})\b(?=\s*,?\s*(?:said|SAID))/i,  // Zip before "said" with lookahead
        /\b(\d{5})\b/,  // Standard zip code with word boundaries
        /([A-Z]{2,})(\d{5})\b/i,  // Zip code immediately after letters (like "CT31405")
    ];
    
    for (const pattern of zipPatterns) {
        const zipMatch = cleaned.match(pattern);
        if (zipMatch) {
            if (pattern.source.includes('([A-Z]{2,})')) {
                // For the pattern that captures letters + zip, the zip is in the second capture group
                extractedZipCode = zipMatch[2];
                console.log(`🏷️ Found zip code attached to text: ${extractedZipCode}`);
                // Also clean the address by separating the zip code
                cleaned = cleaned.replace(pattern, '$1 $2');
            } else {
                extractedZipCode = zipMatch[1];
                console.log(`🏷️ Found zip code in address: ${extractedZipCode}`);
            }
            break;
        }
    }
    
    // First, try to extract addresses from lot/subdivision patterns
    const extractionPatterns = [
        // "LOT 26 MISTWOODE SUB 17 RUSTIC LN" -> "17 RUSTIC LN"
        /^lot\s+\d+.*?\s+(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY))/i,
        // "105 MILLS RUN S/D PHASE 3 108 BLAINE CT 31405" -> "108 BLAINE CT"  
        /^.*?(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY))\s+\d{5}\b/i,
        // "105 MILLS RUN S/D PHASE 3 108 BLAINE CT" -> "108 BLAINE CT" (with comma)
        /^.*?(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY))\s+\d+,/i,
        // Generic: "SOMETHING 123 MAIN ST" -> "123 MAIN ST"
        /^.*?(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY))/i,
        // "88 KNIGHTSBRIDGE SUB PH 3 SMB 13S 3, 112 ST IVES DR" -> "112 ST IVES DR"
        /^.*?,\s*(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY))/i,
    ];
    
    // Try extraction patterns first
    for (const pattern of extractionPatterns) {
        const match = cleaned.match(pattern);
        if (match && match[1]) {
            cleaned = match[1].trim();
            console.log(`🎯 Extracted address: "${cleaned}"`);
            break;
        }
    }
    
    // Remove "said property" and similar legal language patterns
    const legalPatterns = [
        /,?\s*said\s+property\s+being\s+formerly.*$/i,
        /,?\s*said\s+property.*$/i,
        /,?\s*SAID\s+property\s+being\s+formerly.*$/i,
        /,?\s*SAID\s+property.*$/i,
        /,?\s*SAID.*$/i,
        /,?\s*said.*$/i,
        /,?\s*being\s+formerly\s+in\s+the\s+name\s+of.*$/i,
        /,?\s*formerly\s+in\s+the\s+name\s+of.*$/i,
        /,?\s*in\s+rem\s+against\s+the\s+property\s+known\s+as\s+/i,
        /^in\s+rem\s*/i,
        /\s+in\s+rem.*$/i,
        // Remove zip codes followed by "said property" patterns (but we should have extracted them already)
        /\s+\d{5}\s*,?\s*said\s+property.*$/i,
        /\s+\d{5}\s*,?\s*SAID.*$/i,
        // Remove subdivision and lot references that are at the end
        /\s+s\/d.*$/i,
        /\s+sub.*$/i,
        /\s+subdivision.*$/i,
        /\s+phase\s+\d+.*$/i,
        /\s+ph\s+\d+.*$/i,
        /\s+smb.*$/i,
        /\s+blk\s+\d+.*$/i,
        /\s+block\s+\d+.*$/i,
        /\s+lot\s+\d+.*$/i,
        /\s+lt\s+\d+.*$/i,
        /\s+\d+,\s*$/i, // trailing numbers with comma
        /,\s*$/i, // trailing comma
    ];
    
    // Apply legal description removal patterns
    for (const pattern of legalPatterns) {
        cleaned = cleaned.replace(pattern, '').trim();
    }
    
    // Clean up extra spaces and formatting
    cleaned = cleaned
        .replace(/\s+/g, ' ') // Multiple spaces to single space
        .replace(/^\s*,\s*|\s*,\s*$/g, '') // Leading/trailing commas
        .replace(/^(and\s+|&\s+)/i, '') // Remove leading "and" or "&"
        .replace(/\s+(and\s+|&\s+).*$/i, '') // Remove everything after "and" or "&"
        .replace(/[‐–—]/g, '-') // Normalize dashes
        .trim();
    
    console.log(`🧹 After cleaning: "${cleaned}"`);
    
    // If we have a reasonable street address pattern, keep it
    if (/^\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY|HIGHWAY)\b/i.test(cleaned)) {
        console.log(`✅ Valid street address pattern found`);
        return { cleaned, zipCode: extractedZipCode };
    }
    
    // If we have just a house number and some text, keep it
    if (/^\d+\s+\w+/.test(cleaned) && cleaned.length > 5) {
        console.log(`✅ Basic address pattern found`);
        return { cleaned, zipCode: extractedZipCode };
    }
    
    // If the cleaned address is too short or doesn't look like an address, try to extract from original
    if (cleaned.length < 5) {
        console.log(`⚠️ Cleaned address too short, trying extraction from original`);
        // Try to extract a street address pattern from the original
        const addressMatch = address.match(/(\d+\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY|HIGHWAY))\b/i);
        if (addressMatch) {
            console.log(`🎯 Extracted from original: "${addressMatch[1]}"`);
            return { cleaned: addressMatch[1].trim(), zipCode: extractedZipCode };
        }
        
        // Try to extract any number followed by words pattern
        const basicMatch = address.match(/(\d+\s+[A-Z\s]{3,})/i);
        if (basicMatch) {
            console.log(`🎯 Basic extraction from original: "${basicMatch[1]}"`);
            return { cleaned: basicMatch[1].trim(), zipCode: extractedZipCode };
        }
    }
    
    console.log(`🧹 Final cleaned address: "${cleaned}"`);
    return { cleaned, zipCode: extractedZipCode };
}

// Geocode a single address
async function geocodeSingleAddress(address, zipCode, county = 'Chatham County', state = 'GA') {
    // Clean the address first
    const cleanResult = cleanAddressForGeocoding(address);
    const cleanAddress = cleanResult.cleaned;
    
    // Use extracted zip code if none was provided
    if (!zipCode && cleanResult.zipCode) {
        zipCode = cleanResult.zipCode;
        console.log(`🏷️ Using extracted zip code: ${zipCode}`);
    }
    
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
                listing.latitude = result.coordinates.lat;
                listing.longitude = result.coordinates.lng;
                listing.geocoded = true;
                listing.geocodeSource = result.cached ? 'cache' : 'nominatim';
                
                if (result.cached) {
                    cached++;
                } else {
                    geocoded++;
                    // Rate limiting: wait between API calls
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                const progress = Math.round(((i + 1) / listings.length) * 100);
                console.log(`✅ Geocoded ${i + 1}/${listings.length} (${progress}%): ${listing.address} -> ${result.coordinates.lat}, ${result.coordinates.lng}`);
            } else {
                listing.coordinates = null;
                listing.latitude = null;
                listing.longitude = null;
                listing.geocoded = false;
                listing.geocodeError = result.message;
                failed++;
                
                const progress = Math.round(((i + 1) / listings.length) * 100);
                console.log(`❌ Failed ${i + 1}/${listings.length} (${progress}%): ${listing.address} - ${result.message}`);
            }
        } catch (error) {
            listing.coordinates = null;
            listing.latitude = null;
            listing.longitude = null;
            listing.geocoded = false;
            listing.geocodeError = error.message;
            failed++;
            console.error(`❌ Error geocoding ${listing.address}:`, error.message);
        }
        
        // Progress update every 5 items or every 10%
        const progressPercent = Math.round(((i + 1) / listings.length) * 100);
        if ((i + 1) % 5 === 0 || progressPercent % 10 === 0) {
            console.log(`🗺️  Geocoding Progress: ${i + 1}/${listings.length} (${progressPercent}%) - ${geocoded + cached} successful, ${failed} failed`);
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
    const filePath = path.join(__dirname, 'app-new.html');
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
    const filePath = path.join(__dirname, 'app-new.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending app-new.html:', err);
            res.status(500).send('Error loading application');
        }
    });
});

// Serve static files (but not index.html at root)
app.use(express.static(path.join(__dirname, '.'), {
    index: false  // Prevent serving index.html automatically
}));

// Function to dynamically fetch current PDF URLs from the tax sale website
async function fetchCurrentTaxSaleUrls() {
    try {
        console.log('🔄 Fetching current tax sale URLs from website...');
        console.log('🌐 Accessing: https://tax.chathamcountyga.gov/TaxSaleList');
        
        const response = await fetch('https://tax.chathamcountyga.gov/TaxSaleList');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Look for links containing specific text patterns
        let taxSaleUrl = null;
        let photoListUrl = null;
        let allCmsLinks = [];
        
        console.log('🔍 Scanning webpage for PDF links...');
        
        // Look for "Tax Sale List" header first, then find the PDF link that follows
        let taxSaleHeaderFound = false;
        let headerElement = null;
        
        console.log('🔍 Looking for "Tax Sale List" header...');
        
        // Find the "Tax Sale List" header
        $('h1, h2, h3, h4, h5, h6, .header, .title, strong, b, *').each((i, element) => {
            const text = $(element).text().trim();
            if (text.toLowerCase().includes('tax sale list') && !taxSaleHeaderFound) {
                console.log(`📍 Found "Tax Sale List" header: "${text}" in <${element.tagName}>`);
                taxSaleHeaderFound = true;
                headerElement = element;
                return false; // break
            }
        });
        
        if (taxSaleHeaderFound && headerElement) {
            console.log('✅ Found "Tax Sale List" header! Looking for PDF link that follows...');
            
            const $header = $(headerElement);
            const $parent = $header.parent();
            let candidateUrls = [];
            
            // Method 1: Look in the same parent container for PDF links
            $parent.find('a').each((i, linkElement) => {
                const href = $(linkElement).attr('href');
                const linkText = $(linkElement).text().trim();
                
                if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                    candidateUrls.push({
                        text: linkText,
                        url: href,
                        method: 'same-container',
                        priority: 10,
                        isPhotoList: linkText.toLowerCase().includes('photo')
                    });
                    console.log(`Found PDF in same container: "${linkText}" -> ${href}`);
                }
            });
            
            // Method 2: Look in following sibling elements
            $header.nextAll().each((i, element) => {
                $(element).find('a').each((j, linkElement) => {
                    const href = $(linkElement).attr('href');
                    const linkText = $(linkElement).text().trim();
                    
                    if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                        candidateUrls.push({
                            text: linkText,
                            url: href,
                            method: 'next-sibling',
                            priority: 8,
                            isPhotoList: linkText.toLowerCase().includes('photo')
                        });
                        console.log(`Found PDF in next sibling: "${linkText}" -> ${href}`);
                    }
                });
            });
            
            // Method 3: Look for links in the broader context near the header
            $('a').each((i, linkElement) => {
                const href = $(linkElement).attr('href');
                const linkText = $(linkElement).text().trim();
                
                if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                    const $link = $(linkElement);
                    const contextText = $link.closest('div, section, article, p').text().trim();
                    
                    // Check if this link is in a context mentioning "Tax Sale List"
                    if (contextText.toLowerCase().includes('tax sale list')) {
                        candidateUrls.push({
                            text: linkText,
                            url: href,
                            method: 'contextual',
                            priority: 6,
                            isPhotoList: linkText.toLowerCase().includes('photo')
                        });
                        console.log(`Found PDF in contextual area: "${linkText}" -> ${href}`);
                    }
                }
            });
            
            // Remove duplicates and prioritize
            const uniqueUrls = candidateUrls.filter((link, index, self) => 
                index === self.findIndex(l => l.url === link.url)
            );
            
            // SPECIAL PRIORITY: If we find the known correct URL, prioritize it
            const correctUrlId = 'bbcf4bac-48f3-47fe-894c-18397e65ebff';
            uniqueUrls.forEach(link => {
                if (link.url.includes(correctUrlId)) {
                    link.priority += 20; // Give highest priority to the known correct URL
                    link.isCorrectUrl = true;
                    console.log(`🎯 FOUND CORRECT URL: "${link.text}" -> ${link.url}`);
                }
            });
            
            // Sort by priority and prefer non-photo lists
            uniqueUrls.sort((a, b) => {
                if (a.isPhotoList && !b.isPhotoList) return 1;
                if (!a.isPhotoList && b.isPhotoList) return -1;
                return b.priority - a.priority;
            });
            
            console.log(`📊 Found ${uniqueUrls.length} PDF links associated with "Tax Sale List" header:`);
            uniqueUrls.forEach((link, i) => {
                const type = link.isPhotoList ? '[PHOTO LIST]' : '[TAX SALE LIST]';
                console.log(`${i + 1}. ${type} [${link.method}] "${link.text}" -> ${link.url}`);
            });
            
            // Select the best candidate (highest priority, non-photo list)
            const mainListCandidates = uniqueUrls.filter(link => !link.isPhotoList);
            const photoListCandidates = uniqueUrls.filter(link => link.isPhotoList);
            
            if (mainListCandidates.length > 0) {
                const selected = mainListCandidates[0];
                taxSaleUrl = selected.url;
                console.log(`✅ Selected Tax Sale List PDF: "${selected.text}" (${selected.method})`);
                console.log(`✅ URL: ${selected.url}`);
            }
            
            if (photoListCandidates.length > 0) {
                photoListUrl = photoListCandidates[0].url;
                console.log(`✅ Found Photo List: "${photoListCandidates[0].text}"`);
            }
            
            // Store all found links for debugging
            allCmsLinks = uniqueUrls;
            
        } else {
            console.log('❌ Could not find "Tax Sale List" header on webpage');
            console.log('� Falling back to searching all CMS links...');
            
            // Fallback to original method if header not found
            $('a').each((i, element) => {
                const linkText = $(element).text().trim();
                const href = $(element).attr('href');
                
                if (href && href.includes('cms.chathamcountyga.gov/api/assets/taxcommissioner')) {
                    allCmsLinks.push({ text: linkText, url: href });
                    console.log(`Found CMS link: "${linkText}" -> ${href}`);
                    
                    if (linkText.toLowerCase().includes('tax sale') && !linkText.toLowerCase().includes('photo') && !taxSaleUrl) {
                        taxSaleUrl = href;
                        console.log(`✅ Fallback Tax Sale URL: ${linkText} -> ${href}`);
                    } else if (linkText.toLowerCase().includes('photo') && !photoListUrl) {
                        photoListUrl = href;
                        console.log(`✅ Fallback Photo URL: ${linkText} -> ${href}`);
                    }
                }
            });
        }
        
        console.log(`📊 Total CMS links found: ${allCmsLinks.length}`);
        
        if (!taxSaleUrl) {
            console.log('❌ Could not find Tax Sale List PDF after "Tax Sale List" header');
            console.log('🔍 All CMS links found on the webpage:');
            allCmsLinks.forEach((link, i) => {
                const type = link.isPhotoList ? '[PHOTO]' : '[LIST]';
                const method = link.method ? `[${link.method}]` : '[FALLBACK]';
                console.log(`   ${i + 1}. ${type} ${method} "${link.text}" -> ${link.url}`);
            });
            throw new Error('Could not find Tax Sale List PDF after "Tax Sale List" header on the webpage');
        }
        
        console.log(`✅ Successfully fetched current URLs from tax sale website`);
        console.log(`✅ Tax Sale URL: ${taxSaleUrl}`);
        console.log(`✅ Photo URL: ${photoListUrl || 'Not found'}`);
        
        return {
            taxSaleUrl,
            photoListUrl,
            fetchedAt: new Date().toISOString(),
            allFoundLinks: allCmsLinks,
            selectionMethod: taxSaleHeaderFound ? 'header-based' : 'fallback',
            headerFound: taxSaleHeaderFound
        };
        
    } catch (error) {
        console.error('❌ Error fetching current tax sale URLs:', error.message);
        console.error('❌ Full error:', error);
        // Return null so we can fall back to hardcoded URLs if needed
        return null;
    }
}

// County configurations
const COUNTY_CONFIGS = {
    chatham: {
        name: 'Chatham County',
        state: 'GA',
        dataType: 'pdf',
        // Current URLs as of August 2025 - these will be fetched dynamically
        url: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/bbcf4bac-48f3-47fe-894c-18397e65ebff?download=0',
        photoListUrl: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/59c03060-15c8-4653-9c6c-0568b45814c9?download=0',
        parser: 'chathamPdfParser',
        dynamicUrls: true, // Flag to indicate we should fetch URLs dynamically
        sourceWebsite: 'https://tax.chathamcountyga.gov/TaxSaleList'
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

// Endpoint to get current PDF URLs for a county without loading full data
app.get('/api/pdf-links/:county', async (req, res) => {
    const { county } = req.params;
    console.log(`PDF links requested for county: ${county}`);
    
    try {
        const config = COUNTY_CONFIGS[county];
        if (!config) {
            return res.status(404).json({ error: 'County not found' });
        }

        // Check if county is under maintenance
        if (config.status === 'maintenance') {
            return res.status(503).json({ 
                error: 'County data temporarily unavailable',
                message: `${config.name} tax sale data is currently being updated.`,
                availableCounties: Object.keys(COUNTY_CONFIGS).filter(key => 
                    COUNTY_CONFIGS[key].status !== 'maintenance'
                )
            });
        }

        let urls = {};
        
        // Get current URLs (use dynamic fetching if enabled)
        if (config.dynamicUrls) {
            console.log(`[DEBUG] Fetching dynamic URLs for ${county}`);
            urls = await fetchCurrentTaxSaleUrls(config);
        } else {
            urls = {
                taxSaleUrl: config.url,
                photoListUrl: config.photoListUrl
            };
        }

        const response = {
            county: config.name,
            pdfUrl: urls.taxSaleUrl,
            photoListUrl: urls.photoListUrl,
            metadata: {
                lastUpdated: new Date().toISOString(),
                photoListAvailable: !!urls.photoListUrl,
                dynamicUrls: !!config.dynamicUrls
            }
        };

        console.log(`[DEBUG] Returning PDF links for ${county}:`, {
            pdfUrl: response.pdfUrl?.substring(0, 80) + '...',
            photoListUrl: response.photoListUrl?.substring(0, 80) + '...'
        });

        res.json(response);
        
    } catch (error) {
        console.error(`Error getting PDF links for ${county}:`, error);
        res.status(500).json({ 
            error: 'Failed to get PDF links',
            details: error.message 
        });
    }
});

// Geocoding endpoint using OpenStreetMap Nominatim API (GET method)
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

// Test endpoint for address cleaning
app.post('/api/test-clean-address', (req, res) => {
    const { address } = req.body;
    
    if (!address) {
        return res.status(400).json({ 
            error: 'Address parameter required' 
        });
    }
    
    try {
        const cleanResult = cleanAddressForGeocoding(address);
        const cleaned = cleanResult.cleaned;
        const extractedZip = cleanResult.zipCode;
        const isValid = cleaned.length > 5 && /^\d+\s+\w+/.test(cleaned);
        
        res.json({
            original: address,
            cleaned: cleaned,
            extractedZipCode: extractedZip,
            isValid: isValid,
            length: cleaned.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            original: address
        });
    }
});

// Single address geocoding endpoint (POST method) for frontend
app.post('/api/geocode', async (req, res) => {
    const { address } = req.body;
    
    if (!address) {
        return res.status(400).json({ 
            success: false, 
            error: 'Address parameter required' 
        });
    }
    
    try {
        console.log('🔍 Server geocoding request for:', address);
        
        // Clean the address first
        const cleanResult = cleanAddressForGeocoding(address);
        const cleanedAddress = cleanResult.cleaned;
        const extractedZip = cleanResult.zipCode;
        console.log('🧹 Cleaned address:', cleanedAddress);
        if (extractedZip) {
            console.log('🏷️ Extracted zip code:', extractedZip);
        }
        
        // Check cache first
        const cacheKey = getCacheKey(cleanedAddress, extractedZip);
        if (geocodeCache[cacheKey]) {
            console.log('📦 Cache hit for:', cleanedAddress);
            return res.json({
                success: true,
                results: [geocodeCache[cacheKey]],
                cached: true,
                strategy: 'cache'
            });
        }
        
        // Try multiple strategies, prioritizing Chatham County/Savannah area
        const strategies = [
            `${cleanedAddress}, Chatham County, Georgia, USA`,
            `${cleanedAddress}, Savannah, Georgia, USA`,
            `${cleanedAddress}, 31401, Georgia, USA`,  // Savannah downtown zip
            `${cleanedAddress}, 31404, Georgia, USA`,  // Common Savannah zip
            `${cleanedAddress}, 31406, Georgia, USA`,  // Common Savannah zip
            `${cleanedAddress}, Georgia, USA`,
            cleanedAddress
        ];
        
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            try {
                console.log(`   Strategy ${i+1}/4: "${strategy}"`);
                
                const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(strategy)}&limit=1&addressdetails=1&countrycodes=us`;
                
                const response = await fetch(nominatimUrl, {
                    headers: {
                        'User-Agent': 'TaxSaleListings/1.0'
                    }
                });
                
                if (!response.ok) {
                    console.log(`   ❌ HTTP error ${response.status} for strategy: "${strategy}"`);
                    continue;
                }
                
                const results = await response.json();
                
                if (results && results.length > 0) {
                    const result = results[0];
                    console.log(`   ✅ Found result: ${result.lat}, ${result.lon}`);
                    
                    // Cache the result
                    geocodeCache[cacheKey] = result;
                    saveGeocodeCache();
                    
                    return res.json({
                        success: true,
                        results: [result],
                        cached: false,
                        strategy: `Strategy ${i+1}: ${strategy}`
                    });
                } else {
                    console.log(`   ❌ No results for strategy: "${strategy}"`);
                }
                
                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.log(`   ❌ Error with strategy "${strategy}":`, error.message);
            }
        }
        
        console.log(`❌ All geocoding strategies failed for: "${address}"`);
        res.json({
            success: false,
            error: 'No coordinates found for address',
            address: address,
            cleanedAddress: cleanedAddress
        });
        
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
    const forceRefresh = req.query.forceRefresh === 'true'; // Check for forceRefresh query parameter
    console.log(`Tax sale listings requested for county: ${county}${forceRefresh ? ' (force refresh)' : ''}`);
    
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
    
    let dataUrl = config.url;
    let currentConfig = { ...config };
    
    // For Chatham County, ALWAYS fetch current URLs dynamically
    console.log(`🔍 DEBUG: Checking dynamic URLs for county: ${county}`);
    console.log(`🔍 DEBUG: config.dynamicUrls = ${config.dynamicUrls}`);
    console.log(`🔍 DEBUG: county === 'chatham' = ${county === 'chatham'}`);
    
    if (county === 'chatham') {
        console.log('🔄 FORCING dynamic URL fetch for Chatham County...');
        console.log(`🔍 Current fallback URL: ${dataUrl}`);
        
        const currentUrls = await fetchCurrentTaxSaleUrls();
        
        if (currentUrls && currentUrls.taxSaleUrl) {
            console.log(`🆕 Dynamic URL found: ${currentUrls.taxSaleUrl}`);
            console.log(`📅 Fetched at: ${currentUrls.fetchedAt}`);
            console.log(`🎯 Selection method: ${currentUrls.selectionMethod} (Header found: ${currentUrls.headerFound})`);
            
            // VALIDATION: Check if this is the correct URL we expect
            const correctUrlId = 'bbcf4bac-48f3-47fe-894c-18397e65ebff';
            const isCorrectUrl = currentUrls.taxSaleUrl.includes(correctUrlId);
            
            if (isCorrectUrl) {
                console.log(`✅ CORRECT URL DETECTED: Using dynamic URL`);
                dataUrl = currentUrls.taxSaleUrl;
                currentConfig.url = currentUrls.taxSaleUrl;
            } else {
                console.log(`⚠️  WRONG URL DETECTED: ${currentUrls.taxSaleUrl}`);
                console.log(`🔄 FORCING correct URL instead: ${config.url}`);
                // Keep using the hardcoded correct URL instead of the wrong dynamic one
                console.log(`✅ Using HARDCODED CORRECT URL: ${dataUrl}`);
            }
            
            currentConfig.photoListUrl = currentUrls.photoListUrl || config.photoListUrl;
            console.log(`✅ Using photo list URL: ${currentConfig.photoListUrl}`);
            
            // Show URL comparison
            if (currentUrls.taxSaleUrl !== config.url) {
                console.log(`🔄 URL comparison:`);
                console.log(`   Dynamic: ${currentUrls.taxSaleUrl}`);
                console.log(`   Hardcoded: ${config.url}`);
                console.log(`   Using: ${dataUrl}`);
            } else {
                console.log(`✅ Dynamic and hardcoded URLs match`);
            }
        } else {
            console.log(`❌ FAILED to fetch current URLs, using hardcoded correct URL`);
            console.log(`📌 Using hardcoded tax sale URL: ${dataUrl}`);
            console.log(`✅ This should be the CORRECT URL`);
        }
    } else {
        console.log(`🚫 NOT Chatham County - using static configuration`);
    }
    
    try {
        console.log(`Fetching ${currentConfig.name} tax sale data from:`, dataUrl);
        
        if (currentConfig.dataType === 'pdf') {
            return await parseChathamPdf(dataUrl, res, currentConfig, forceRefresh);
        } else if (currentConfig.dataType === 'csv') {
            return await parseDekalbCsv(dataUrl, res, currentConfig);
        } else {
            throw new Error(`Unsupported data type: ${currentConfig.dataType}`);
        }
    } catch (err) {
        console.error(`Error processing tax sale listings for ${county}:`, err);
        console.error('Error stack:', err.stack);
        
        res.status(500).json({ 
            error: err.message,
            county: currentConfig.name,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Function to extract images from PDF and map them to properties
async function extractImagesFromPdf(pdfBuffer, photoListText, parsedListings) {
    try {
        console.log('🖼️  Starting image extraction from PDF...');
        
        // Create images directory if it doesn't exist
        const imagesDir = path.join(__dirname, 'images');
        try {
            await fs.access(imagesDir);
        } catch {
            await fs.mkdir(imagesDir, { recursive: true });
        }
        
        console.log('🖼️  Converting PDF pages to images...');
        
        // Try multiple extraction methods to handle different PDF formats
        let results = [];
        let extractionMethod = 'unknown';
        
        try {
            // Method 1: pdf2pic with basic settings
            console.log('🖼️  Trying pdf2pic extraction...');
            const convert = pdf2pic.fromBuffer(pdfBuffer, {
                density: 150,           // Lower DPI to reduce memory usage
                saveFilename: "page",   // Base filename
                savePath: imagesDir,    // Save to images directory
                format: "jpg",          // Output format
                width: 600,             // Reduced width
                height: 900,            // Reduced height
                quality: 75             // Lower quality to reduce size
            });
            
            results = await convert.bulk(-1); // -1 means all pages
            extractionMethod = 'pdf2pic';
            console.log(`🖼️  pdf2pic extracted ${results.length} page images`);
            
        } catch (pdf2picError) {
            console.log('⚠️  pdf2pic failed, trying alternative method:', pdf2picError.message);
            
            try {
                // Method 2: Try with even simpler settings
                console.log('🖼️  Trying pdf2pic with minimal settings...');
                const convertSimple = pdf2pic.fromBuffer(pdfBuffer, {
                    density: 72,            // Very low DPI
                    saveFilename: "simple",
                    savePath: imagesDir,
                    format: "png",          // Try PNG instead
                    quality: 50
                });
                
                results = await convertSimple.bulk(-1);
                extractionMethod = 'pdf2pic-simple';
                console.log(`🖼️  Simple pdf2pic extracted ${results.length} page images`);
                
            } catch (simpleError) {
                console.log('⚠️  Simple pdf2pic also failed:', simpleError.message);
                console.log('🖼️  Continuing without image extraction - photos will show placeholder text');
                return {};
            }
        }
        
        // Map images to properties based on estimated page numbers from photo parsing
        const imageMap = {};
        
        for (const listing of parsedListings) {
            if (listing.photoData && listing.photoData.estimatedPage) {
                const pageNumber = listing.photoData.estimatedPage;
                
                // Find the corresponding image file based on extraction method
                let pageImage = null;
                
                if (extractionMethod === 'pdf2pic') {
                    pageImage = results.find(result => 
                        result.name && result.name.includes(`page.${pageNumber}`)
                    );
                } else if (extractionMethod === 'pdf2pic-simple') {
                    pageImage = results.find(result => 
                        result.name && result.name.includes(`simple.${pageNumber}`)
                    );
                }
                
                if (pageImage && pageImage.path) {
                    // Create a web-accessible filename
                    const imageFilename = `property_${listing.parcelId}_page_${pageNumber}.jpg`;
                    const imagePath = path.join(imagesDir, imageFilename);
                    
                    // Copy the image with a more descriptive name
                    try {
                        await fs.copyFile(pageImage.path, imagePath);
                        
                        imageMap[listing.parcelId] = {
                            filename: imageFilename,
                            path: imagePath,
                            webPath: `/images/${imageFilename}`,
                            page: pageNumber
                        };
                        
                        console.log(`🖼️  Mapped image for parcel ${listing.parcelId} from page ${pageNumber}`);
                    } catch (copyError) {
                        console.error(`❌ Failed to copy image for ${listing.parcelId}:`, copyError.message);
                    }
                }
            }
        }
        
        console.log(`🖼️  Image extraction complete: ${Object.keys(imageMap).length} properties have images`);
        return imageMap;
        
    } catch (error) {
        console.error('❌ Image extraction failed:', error.message);
        return {};
    }
}

// Chatham County PDF parser with database caching
async function parseChathamPdf(pdfUrl, res, config, forceRefresh = false) {
    console.log(`Starting PDF parsing for ${config.name} from:`, pdfUrl);
    
    try {
        const response = await fetch(pdfUrl);
        
        if (!response.ok) {
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            console.error('PDF fetch failed:', errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('PDF fetch successful, status:', response.status);
        const buffer = await response.buffer();
        console.log('Buffer size:', buffer.length);

        // Check if PDF has changed using database (unless force refresh is requested)
        const filename = `${config.name}_tax_sale_${new Date().toISOString().split('T')[0]}.pdf`;
        let fileCheck = { changed: true, isNew: true };
        
        if (!forceRefresh) {
            fileCheck = await db.hasFileChanged(filename, buffer);
            console.log('File change check:', fileCheck);
        } else {
            console.log('🔄 Force refresh mode - bypassing cache check');
        }

        if (!forceRefresh && !fileCheck.changed && !fileCheck.isNew) {
            // File hasn't changed, return cached data from database
            console.log('📊 PDF unchanged, returning cached data from database');
            const cachedProperties = await db.getAllProperties();
            const geocodeStats = await db.getGeocodingStats();
            
            return res.json({
                parsedListings: cachedProperties,
                totalListings: cachedProperties.length,
                fromCache: true,
                county: config.name,
                geocodeStats: {
                    successful: geocodeStats.geocoded,
                    total: geocodeStats.total,
                    fromCache: geocodeStats.geocoded,
                    newlyGeocoded: 0
                },
                metadata: {
                    processedAt: new Date().toISOString(),
                    cacheUsed: true,
                    lastGeocoded: geocodeStats.lastGeocoded,
                    source: `Cached data from ${config.name} Tax Commissioner`
                }
            });
        }

        // File is new or changed, process it
        console.log('📄 Processing new/changed PDF file...');
        const data = await pdfParse(buffer);
        console.log('PDF parsing successful, text length:', data.text.length);

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
    const seenParcelIds = new Set(); // Track seen parcel IDs to prevent duplicates
    let currentListing = {};
    
    // Look for patterns that indicate new property listings
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this looks like a parcel ID - various patterns:
        // Single patterns: 10115A03001, or first part of split: 10045 followed by 12032
        let isParcelStart = false;
        let fullParcelId = line;
        
        // Pattern 1: Complete parcel ID in one line (like 10115A03001, 10115A03032)
        if (/^\d{5}[A-Z]\d{5}$/.test(line) || /^\d{4,6}[\-\.]\d{2,4}[\-\.]\d{3,4}$/.test(line)) {
            isParcelStart = true;
            console.log(`DEBUG: Found complete parcel ID: ${line}`);
        }
        // Pattern 2: First part of split parcel ID (4-6 digits followed by another 4-6 digits on next line)
        else if (/^\d{4,6}$/.test(line) && i + 1 < lines.length && /^\d{4,6}$/.test(lines[i + 1])) {
            // Additional validation: skip if this looks like a zip code (31410, etc.)
            const nextLine = lines[i + 1];
            
            // Skip if first number is 5 digits starting with 3 (likely zip code like 31410)
            if (line.length === 5 && line.startsWith('3')) {
                console.log(`DEBUG: Skipping potential zip code: ${line}`);
            } else {
                // Check if the next line is also digits (second part of parcel ID)
                fullParcelId = line + '-' + nextLine;
                isParcelStart = true;
                console.log(`DEBUG: Found split parcel ID: ${line} + ${nextLine} = ${fullParcelId}`);
                i++; // Skip the next line since we've processed it
            }
        }
        
        if (isParcelStart) {
            // Check if we've already seen this parcel ID
            if (seenParcelIds.has(fullParcelId)) {
                console.log(`DEBUG: Skipping duplicate parcel ID: ${fullParcelId}`);
                continue;
            }
            
            // Save previous listing if it exists
            if (Object.keys(currentListing).length > 0) {
                // Map parsed amount to taxAmount field for database storage
                if (currentListing.amount && !currentListing.taxAmount) {
                    // Remove $ and convert to number, then back to string with $
                    const cleanAmount = currentListing.amount.replace(/[$,]/g, '');
                    if (!isNaN(parseFloat(cleanAmount))) {
                        currentListing.taxAmount = currentListing.amount;
                        console.log(`DEBUG: Successfully mapped amount to taxAmount for ${currentListing.property}: ${currentListing.taxAmount}`);
                    } else {
                        console.log(`DEBUG: Failed to parse amount as number: ${currentListing.amount}`);
                    }
                } else if (!currentListing.amount) {
                    console.log(`DEBUG: No amount found for property: ${currentListing.property}`);
                } else {
                    console.log(`DEBUG: taxAmount already set for ${currentListing.property}: ${currentListing.taxAmount}`);
                }
                parsedListings.push({...currentListing});
            }
            
            // Add this parcel ID to seen set
            seenParcelIds.add(fullParcelId);
            
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
                
                // Enhanced amount detection - look for various amount patterns
                if (!foundAmount) {
                    let amountMatch = null;
                    console.log(`DEBUG: Checking line for amount: "${nextLine}"`);
                    
                    // Pattern 1: Dollar sign with amount ($1,234.56)
                    if (nextLine.includes('$')) {
                        amountMatch = nextLine.match(/\$[\d,]+\.?\d*/);
                        if (amountMatch) {
                            currentListing.amount = amountMatch[0];
                            foundAmount = true;
                            console.log(`DEBUG: Found $ amount: ${amountMatch[0]}`);
                        }
                    }
                    // Pattern 2: Decimal number that looks like currency (1234.56, 1,234.56)
                    else if (/^[\d,]+\.\d{2}$/.test(nextLine)) {
                        currentListing.amount = '$' + nextLine;
                        foundAmount = true;
                        console.log(`DEBUG: Found decimal amount: $${nextLine}`);
                    }
                    // Pattern 3: Check if previous line was "$" and current line is amount (4,672.58)
                    else if (j > 0 && lines[j-1] === '$' && /^[\d,]+\.?\d*$/.test(nextLine)) {
                        currentListing.amount = '$' + nextLine;
                        foundAmount = true;
                        console.log(`DEBUG: Found split $ + amount: $${nextLine}`);
                    }
                    // Pattern 4: Large number without decimals that could be cents (123456 -> $1234.56)
                    else if (/^\d{5,}$/.test(nextLine) && parseInt(nextLine) > 10000) {
                        const dollars = Math.floor(parseInt(nextLine) / 100);
                        const cents = parseInt(nextLine) % 100;
                        currentListing.amount = `$${dollars.toLocaleString()}.${cents.toString().padStart(2, '0')}`;
                        foundAmount = true;
                        console.log(`DEBUG: Found large number amount: ${currentListing.amount}`);
                    }
                    // Pattern 5: Amount in parentheses or with other formatting
                    else if (/[\d,]+\.?\d*/.test(nextLine) && nextLine.length < 15) {
                        const numMatch = nextLine.match(/[\d,]+\.?\d*/);
                        if (numMatch && parseFloat(numMatch[0].replace(/,/g, '')) > 100) {
                            currentListing.amount = '$' + numMatch[0];
                            foundAmount = true;
                            console.log(`DEBUG: Found formatted amount: $${numMatch[0]}`);
                        }
                    }
                }
                
                // Identify zip code (5 digits)
                if (/^\d{5}$/.test(nextLine) && !currentListing.zipCode) {
                    // Check if the next line has "SAID" to confirm this is likely a zip code
                    const followingLine = j + 1 < lines.length ? lines[j + 1] : '';
                    if (/^\s*(?:said|SAID)(?:\s+property)?/i.test(followingLine) || 
                        // Also accept standalone zip codes even without SAID
                        followingLine.length === 0 || 
                        /^[A-Z\s]+$/i.test(followingLine)) {
                        currentListing.zipCode = nextLine;
                        console.log(`DEBUG: Found zip code: ${nextLine}${followingLine ? ` (followed by: "${followingLine}")` : ''}`);
                    }
                }
                
                // Also check for zip codes embedded in text (like "31406, said property")
                const zipInText = nextLine.match(/(\d{5})(?:\s*,?\s*(?:said|SAID)(?:\s+property)?(?:\s+being)?)/i);
                if (zipInText && !currentListing.zipCode) {
                    currentListing.zipCode = zipInText[1];
                    console.log(`DEBUG: Found embedded zip code: ${zipInText[1]} in text: "${nextLine}"`);
                }
                
                // Check for zip codes at the end of address lines
                const zipAtEnd = nextLine.match(/(\d{5})\s*,?\s*$/);
                if (zipAtEnd && !currentListing.zipCode) {
                    currentListing.zipCode = zipAtEnd[1];
                    console.log(`DEBUG: Found trailing zip code: ${zipAtEnd[1]} in text: "${nextLine}"`);
                }
                
                j++;
            }
            
            // Parse owner and address from the collected lines
            if (allDataLines.length > 0) {
                console.log(`DEBUG: Processing parcel ${fullParcelId} with data:`, allDataLines);
                console.log(`DEBUG: Found amount for ${fullParcelId}:`, currentListing.amount || 'NO AMOUNT FOUND');
                console.log(`DEBUG: Found zip code so far for ${fullParcelId}:`, currentListing.zipCode || 'NO ZIP CODE FOUND');
                
                // Additional comprehensive zip code search in all data before filtering
                if (!currentListing.zipCode) {
                    console.log(`DEBUG: Performing comprehensive zip code search in all data lines...`);
                    for (let i = 0; i < allDataLines.length; i++) {
                        const searchLine = allDataLines[i];
                        const zipPatterns = [
                            /(\d{5})(?:\s*,?\s*(?:said|SAID)\s+property\s+being)/i,  // Zip followed by "said property being"
                            /(\d{5})(?:\s*,?\s*(?:said|SAID)\s+property)/i,  // Zip followed by "said property"
                            /(\d{5})(?:\s*,?\s*(?:said|SAID))/i,  // Zip followed by "said"
                            /(\d{5})\s*,?\s*$/,  // Zip at end of line
                            /\b(\d{5})\b(?=\s*,?\s*(?:said|SAID))/i,  // Zip before "said" with lookahead
                            /\b(\d{5})\b/,  // Any 5-digit number with word boundaries
                        ];
                        
                        for (let pattern of zipPatterns) {
                            const match = searchLine.match(pattern);
                            if (match) {
                                currentListing.zipCode = match[1];
                                console.log(`DEBUG: Found zip code in comprehensive search: ${match[1]} from line: "${searchLine}"`);
                                break;
                            }
                        }
                        
                        // Also check for cross-line patterns: zip code on one line, "SAID" on next line
                        if (!currentListing.zipCode && /^\d{5}$/.test(searchLine.trim())) {
                            const nextLine = i + 1 < allDataLines.length ? allDataLines[i + 1] : '';
                            if (/^\s*(?:said|SAID)(?:\s+property)?/i.test(nextLine)) {
                                currentListing.zipCode = searchLine.trim();
                                console.log(`DEBUG: Found cross-line zip code: ${currentListing.zipCode} followed by "${nextLine}"`);
                                break;
                            }
                        }
                        
                        if (currentListing.zipCode) break;
                    }
                }
                
                // Find the house number (first number that's not 5 digits)
                let houseNumberIndex = -1;
                let zipIndex = -1;
                
                for (let k = 0; k < allDataLines.length; k++) {
                    // Find house number (first number that's not a zip code)
                    if (/^\d+$/.test(allDataLines[k]) && !(/^\d{5}$/.test(allDataLines[k])) && houseNumberIndex === -1) {
                        houseNumberIndex = k;
                        console.log(`DEBUG: Found standalone house number at index ${k}: ${allDataLines[k]}`);
                    }
                    // Also look for house numbers at the start of lines (like "108 BLAINE CT 31405")
                    else if (/^\d{1,4}\s+[A-Z\s]+/i.test(allDataLines[k]) && houseNumberIndex === -1) {
                        // Check if this line contains a street address pattern
                        if (/^\d{1,4}\s+[A-Z\s]+(?:ST|AVE|DR|CT|CIR|LN|RD|WAY|PL|BLVD|PKWY|HWY)/i.test(allDataLines[k])) {
                            houseNumberIndex = k;
                            console.log(`DEBUG: Found house number in address line at index ${k}: ${allDataLines[k]}`);
                        }
                    }
                    
                    // Find zip code - standalone or embedded
                    if (/^\d{5}$/.test(allDataLines[k])) {
                        zipIndex = k;
                        console.log(`DEBUG: Found standalone zip at index ${k}: ${allDataLines[k]}`);
                    } else if (allDataLines[k].match(/(\d{5})(?:\s*,?\s*(?:said|SAID)(?:\s+property)?(?:\s+being)?|$)/i)) {
                        // Zip code embedded in text or at end of line
                        zipIndex = k;
                        console.log(`DEBUG: Found embedded zip at index ${k}: ${allDataLines[k]}`);
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
                        !/^\d{5}$/.test(part) && // Not zip code
                        // Filter out "said property" and similar legal language during parsing
                        !/^said$/i.test(part) &&
                        !/^property$/i.test(part) &&
                        !/^being$/i.test(part) &&
                        !/^formerly$/i.test(part) &&
                        !part.toLowerCase().includes('said property')
                    );
                    
                    // Clean the constructed address to remove any remaining legal language
                    const cleaningResult = cleanAddressForGeocoding(addressParts.join(' '));
                    currentListing.address = cleaningResult.cleaned;
                    
                    // Use extracted zip code from address cleaning if not found yet
                    if (!currentListing.zipCode && cleaningResult.zipCode) {
                        currentListing.zipCode = cleaningResult.zipCode;
                        console.log(`DEBUG: Using zip code extracted during address cleaning: ${cleaningResult.zipCode}`);
                    }
                    
                    // Final zip code extraction from the raw address parts if not found yet
                    if (!currentListing.zipCode) {
                        console.log(`DEBUG: No zip code found yet, checking raw address parts:`, addressParts);
                        const fullRawAddress = addressParts.join(' ');
                        const zipMatch = fullRawAddress.match(/\b(\d{5})\b/);
                        if (zipMatch) {
                            currentListing.zipCode = zipMatch[1];
                            console.log(`DEBUG: Extracted zip code from full address: ${zipMatch[1]} from "${fullRawAddress}"`);
                        }
                    }
                } else {
                    // Fallback: if no house number found, split roughly in half
                    const splitPoint = Math.floor(allDataLines.length / 2);
                    const ownerParts = allDataLines.slice(0, splitPoint).filter(part => 
                        part.length > 0 && !part.includes('$') && !/^[\d,]+\.[\d,]+$/.test(part)
                    );
                    const addressParts = allDataLines.slice(splitPoint).filter(part => 
                        part.length > 0 && !part.includes('$') && !/^[\d,]+\.[\d,]+$/.test(part) && !/^\d{5}$/.test(part) &&
                        // Filter out "said property" and similar legal language during parsing
                        !/^said$/i.test(part) &&
                        !/^property$/i.test(part) &&
                        !/^being$/i.test(part) &&
                        !/^formerly$/i.test(part) &&
                        !part.toLowerCase().includes('said property')
                    );
                    
                    currentListing.owner = ownerParts.slice(0, 4).join(' ');
                    // Clean the constructed address to remove any remaining legal language
                    const cleaningResult = cleanAddressForGeocoding(addressParts.join(' '));
                    currentListing.address = cleaningResult.cleaned;
                    
                    // Use extracted zip code from address cleaning if not found yet
                    if (!currentListing.zipCode && cleaningResult.zipCode) {
                        currentListing.zipCode = cleaningResult.zipCode;
                        console.log(`DEBUG: Using zip code extracted during address cleaning (fallback): ${cleaningResult.zipCode}`);
                    }
                    
                    // Final zip code extraction from the raw address parts if not found yet
                    if (!currentListing.zipCode) {
                        console.log(`DEBUG: No zip code found yet (fallback), checking raw address parts:`, addressParts);
                        const fullRawAddress = addressParts.join(' ');
                        const zipMatch = fullRawAddress.match(/\b(\d{5})\b/);
                        if (zipMatch) {
                            currentListing.zipCode = zipMatch[1];
                            console.log(`DEBUG: Extracted zip code from full address (fallback): ${zipMatch[1]} from "${fullRawAddress}"`);
                        }
                    }
                }
            }
            
            // Skip processed lines
            i = j - 1;
        }
    }
    
    // Add the last listing (only if not already added)
    if (Object.keys(currentListing).length > 0 && currentListing.parcelId) {
        // Map parsed amount to taxAmount field for database storage
        if (currentListing.amount && !currentListing.taxAmount) {
            // Remove $ and convert to number, then back to string with $
            const cleanAmount = currentListing.amount.replace(/[$,]/g, '');
            if (!isNaN(parseFloat(cleanAmount))) {
                currentListing.taxAmount = currentListing.amount;
            }
        }
        
        // Check if this listing was already added (avoid duplicates)
        const isDuplicate = parsedListings.some(listing => listing.parcelId === currentListing.parcelId);
        if (!isDuplicate) {
            parsedListings.push(currentListing);
            console.log(`DEBUG: Added final listing: ${currentListing.parcelId}`);
        } else {
            console.log(`DEBUG: Skipped duplicate final listing: ${currentListing.parcelId}`);
        }
    }

    // Parse photo list and correlate with parcel IDs
    const photoMap = {};
    if (photoData) {
        const photoLines = photoData.text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        console.log('Photo list has', photoLines.length, 'lines');
        const seenPhotoParcelIds = new Set(); // Track seen photo parcel IDs
        
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
                
                // Check if we've already seen this photo parcel ID
                if (seenPhotoParcelIds.has(parcelId)) {
                    console.log(`DEBUG: Skipping duplicate photo parcel ID: ${parcelId}`);
                    continue;
                }
                
                seenPhotoParcelIds.add(parcelId);
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
            // Use bidAmount from photoData as the primary tax amount source
            if (listing.photoData.bidAmount) {
                listing.amount = listing.photoData.bidAmount;
                listing.taxAmount = listing.photoData.bidAmount;
                console.log(`DEBUG: Using photo bidAmount as taxAmount for ${listing.parcelId}: ${listing.taxAmount}`);
            }
        } else {
            listing.photoData = null;
            listing.hasPhotos = false;
        }
    });
    
    // Final deduplication step - remove any remaining duplicates based on parcel ID
    const finalListings = [];
    const finalSeenParcelIds = new Set();
    
    parsedListings.forEach(listing => {
        if (!finalSeenParcelIds.has(listing.parcelId)) {
            finalSeenParcelIds.add(listing.parcelId);
            finalListings.push(listing);
        } else {
            console.log(`DEBUG: Removed duplicate property in final cleanup: ${listing.parcelId}`);
        }
    });
    
    console.log(`DEBUG: Removed ${parsedListings.length - finalListings.length} duplicate properties in final cleanup`);
    
    // Replace parsedListings with deduplicated finalListings
    parsedListings.length = 0; // Clear original array
    parsedListings.push(...finalListings); // Add deduplicated items
    
    // Extract images from photo PDF and map to properties
    let imageMap = {};
    if (config.photoListUrl && photoData) {
        try {
            // Fetch the photo PDF again for image extraction
            console.log('🖼️  Fetching photo PDF for image extraction...');
            const photoResponse = await fetch(config.photoListUrl);
            if (photoResponse.ok) {
                const photoBuffer = await photoResponse.buffer();
                imageMap = await extractImagesFromPdf(photoBuffer, photoData.text, parsedListings);
            }
        } catch (error) {
            console.error('❌ Image extraction failed:', error.message);
        }
    }
    
    // Add image data to listings
    parsedListings.forEach(listing => {
        if (imageMap[listing.parcelId]) {
            listing.imageData = imageMap[listing.parcelId];
            listing.hasImage = true;
            console.log(`🖼️  Added image data for ${listing.parcelId}: ${listing.imageData.webPath}`);
        } else {
            listing.imageData = null;
            listing.hasImage = false;
        }
    });
    
    // Geocode all listings before returning them
    console.log(`🗺️  Starting background geocoding for ${parsedListings.length} properties...`);
    const geocodeStats = await geocodeAllListings(parsedListings, config.name, 'GA');
    
    // Store the PDF file and properties in database
    console.log('💾 Storing properties in database...');
    
    // Debug: Check what amounts are in parsedListings before storage
    console.log(`DEBUG: About to store ${parsedListings.length} properties`);
    parsedListings.forEach((listing, index) => {
        if (index < 5) { // Log first 5 properties for debugging
            console.log(`DEBUG: Property ${index + 1} - ${listing.property}:`);
            console.log(`  amount: ${listing.amount}`);
            console.log(`  taxAmount: ${listing.taxAmount}`);
            console.log(`  bidAmount: ${listing.bidAmount}`);
        }
    });
    
    const pdfFileId = await db.storePdfFile(filename, fileCheck.currentHash);
    await db.storeProperties(pdfFileId, parsedListings);
    console.log(`✅ Stored ${parsedListings.length} properties in database`);
    
    // Clean up old PDF file records to prevent accumulation
    await db.cleanupOldPdfFiles();
    
    res.json({ 
        rawLines: lines,
        parsedListings: parsedListings,
        totalListings: parsedListings.length,
        originalText: rawText.substring(0, 500) + '...', // First 500 chars for debugging
        pdfUrl: pdfUrl, // Include the PDF URL so frontend can show the correct link
        photoListUrl: config.photoListUrl,
        county: config.name,
        geocodeStats: geocodeStats, // Include geocoding statistics
        fromCache: false,
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
            note: "✅ This is the current official tax sale list from tax.chathamcountyga.gov/TaxSaleList",
            databaseStored: true
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

// Get cached properties from database
app.get('/api/cached-properties', async (req, res) => {
    try {
        const properties = await db.getAllProperties();
        const stats = await db.getGeocodingStats();
        
        res.json({
            properties: properties,
            totalProperties: properties.length,
            geocodeStats: stats,
            fromDatabase: true,
            cachedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching cached properties:', error);
        res.status(500).json({ error: 'Failed to fetch cached properties' });
    }
});

// Get database statistics
app.get('/api/database-stats', async (req, res) => {
    console.log('📊 Database stats requested');
    try {
        const stats = await db.getGeocodingStats();
        
        res.json({
            database: 'SQLite',
            stats: stats,
            status: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching database stats:', error);
        res.status(500).json({ error: 'Failed to fetch database statistics' });
    }
});

// Add endpoint to clear cache for testing
app.post('/api/clear-cache', async (req, res) => {
    console.log('🗑️ Cache clear requested');
    try {
        // Clear all data from the database to force fresh parsing
        await db.clearAllData();
        console.log('✅ Database cache cleared');
        res.json({ message: 'Cache cleared successfully' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Force refresh - clears database and re-processes PDF
app.post('/api/force-refresh/:county', async (req, res) => {
    console.log(`🔄 Force refresh requested for county: ${req.params.county}`);
    try {
        const county = req.params.county;
        const config = COUNTY_CONFIGS[county];
        
        if (!config) {
            console.log(`❌ County not found: ${county}`);
            return res.status(404).json({ error: 'County not found' });
        }

        console.log('🔄 Force refresh requested - will re-process PDF...');
        console.log('Config:', config);
        
        // Re-process the PDF (the parseChathamPdf function will handle database updates)
        if (config.dataType === 'pdf') {
            return await parseChathamPdf(config.url, res, config, true); // Pass true for forceRefresh
        } else {
            throw new Error(`Unsupported data type: ${config.dataType}`);
        }
        
    } catch (error) {
        console.error('Error in force refresh:', error);
        res.status(500).json({ error: 'Failed to force refresh' });
    }
});

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

// Debug endpoint to show current data status
app.get('/api/debug-status', async (req, res) => {
    console.log('🔍 Debug status requested');
    try {
        const stats = await db.getStats();
        const properties = await db.getProperties('chatham');
        
        // Get a sample property if available
        const sampleProperty = properties.length > 0 ? properties[0] : null;
        
        res.json({
            timestamp: new Date().toISOString(),
            database: {
                totalProperties: stats.totalProperties || 0,
                counties: stats.counties || [],
                lastUpdated: stats.lastUpdated
            },
            sampleProperty: sampleProperty ? {
                parcelId: sampleProperty.parcelId,
                owner: sampleProperty.owner,
                amount: sampleProperty.amount || sampleProperty.taxAmount,
                address: sampleProperty.address
            } : null,
            config: {
                hardcodedUrl: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/bbcf4bac-48f3-47fe-894c-18397e65ebff?download=0',
                dynamicUrlsEnabled: true
            },
            instructions: {
                clearCache: 'POST /api/clear-cache',
                forceRefresh: 'GET /api/tax-sale-listings/chatham?forceRefresh=true',
                viewData: 'GET /api/tax-sale-listings/chatham'
            }
        });
    } catch (error) {
        console.error('Debug status error:', error);
        res.status(500).json({ error: 'Failed to get debug status' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Available counties:', Object.keys(COUNTY_CONFIGS));
    console.log('Serving files from:', __dirname);
});
