const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

class PropertyDatabase {
    constructor(dbPath = './properties.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.initDatabase();
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                    return;
                }
                console.log('Connected to SQLite database');
                this.createTables().then(resolve).catch(reject);
            });
        });
    }

    createTables() {
        return new Promise((resolve, reject) => {
            const createTablesSQL = `
                CREATE TABLE IF NOT EXISTS pdf_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT UNIQUE,
                    file_hash TEXT,
                    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_processed DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS properties (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pdf_file_id INTEGER,
                    property_index INTEGER,
                    parcel_id TEXT,
                    owner_name TEXT,
                    property_address TEXT,
                    cleaned_address TEXT,
                    city TEXT,
                    state TEXT,
                    zip_code TEXT,
                    legal_description TEXT,
                    tax_amount REAL,
                    bid_amount REAL,
                    latitude REAL,
                    longitude REAL,
                    geocoded_at DATETIME,
                    geocoding_success BOOLEAN DEFAULT 0,
                    raw_data TEXT,
                    FOREIGN KEY (pdf_file_id) REFERENCES pdf_files (id)
                );

                CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(property_address);
                CREATE INDEX IF NOT EXISTS idx_properties_geocoded ON properties(geocoding_success);
                CREATE INDEX IF NOT EXISTS idx_pdf_files_hash ON pdf_files(file_hash);
            `;

            this.db.exec(createTablesSQL, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    reject(err);
                } else {
                    console.log('Database tables created successfully');
                    resolve();
                }
            });
        });
    }

    // Calculate file hash to detect changes
    calculateFileHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    // Check if PDF file has changed
    async hasFileChanged(filename, fileBuffer) {
        return new Promise((resolve, reject) => {
            const currentHash = this.calculateFileHash(fileBuffer);
            
            this.db.get(
                'SELECT file_hash FROM pdf_files WHERE filename = ?',
                [filename],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!row) {
                        // File doesn't exist in database
                        resolve({ changed: true, isNew: true, currentHash });
                    } else {
                        // File exists, check if hash changed
                        resolve({ 
                            changed: row.file_hash !== currentHash, 
                            isNew: false, 
                            currentHash,
                            storedHash: row.file_hash 
                        });
                    }
                }
            );
        });
    }

    // Store or update PDF file record
    async storePdfFile(filename, fileHash) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO pdf_files (filename, file_hash, last_processed) 
                 VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [filename, fileHash],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    // Store properties for a PDF file
    async storeProperties(pdfFileId, properties) {
        return new Promise((resolve, reject) => {
            // First, delete existing properties for this PDF
            this.db.run(
                'DELETE FROM properties WHERE pdf_file_id = ?',
                [pdfFileId],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Insert new properties
                    const stmt = this.db.prepare(`
                        INSERT INTO properties (
                            pdf_file_id, property_index, parcel_id, owner_name, 
                            property_address, cleaned_address, city, state, zip_code,
                            legal_description, tax_amount, bid_amount, 
                            latitude, longitude, geocoded_at, geocoding_success, raw_data
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    let completed = 0;
                    const total = properties.length;

                    if (total === 0) {
                        resolve();
                        return;
                    }

                    properties.forEach((property, index) => {
                        stmt.run([
                            pdfFileId,
                            index,
                            property.parcelId || '',
                            property.ownerName || '',
                            property.address || '',
                            property.cleanedAddress || '',
                            property.city || '',
                            property.state || '',
                            property.zipCode || '',
                            property.legalDescription || '',
                            property.taxAmount || null,
                            property.bidAmount || null,
                            property.latitude || null,
                            property.longitude || null,
                            property.latitude ? new Date().toISOString() : null,
                            property.latitude ? 1 : 0,
                            JSON.stringify(property)
                        ], (err) => {
                            if (err) {
                                console.error('Error inserting property:', err);
                            }
                            completed++;
                            if (completed === total) {
                                stmt.finalize();
                                resolve();
                            }
                        });
                    });
                }
            );
        });
    }

    // Get all properties from database
    async getAllProperties() {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT p.*, pf.filename, pf.upload_date 
                 FROM properties p 
                 JOIN pdf_files pf ON p.pdf_file_id = pf.id 
                 ORDER BY p.property_index`,
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Convert rows back to property objects
                        const properties = rows.map(row => ({
                            parcelId: row.parcel_id,
                            ownerName: row.owner_name,
                            address: row.property_address,
                            cleanedAddress: row.cleaned_address,
                            city: row.city,
                            state: row.state,
                            zipCode: row.zip_code,
                            legalDescription: row.legal_description,
                            taxAmount: row.tax_amount,
                            bidAmount: row.bid_amount,
                            latitude: row.latitude,
                            longitude: row.longitude,
                            geocodingSuccess: Boolean(row.geocoding_success),
                            geocodedAt: row.geocoded_at,
                            filename: row.filename,
                            uploadDate: row.upload_date,
                            index: row.property_index
                        }));
                        resolve(properties);
                    }
                }
            );
        });
    }

    // Get geocoding statistics
    async getGeocodingStats() {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN geocoding_success = 1 THEN 1 ELSE 0 END) as geocoded,
                    MAX(geocoded_at) as last_geocoded
                 FROM properties`,
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            total: row.total || 0,
                            geocoded: row.geocoded || 0,
                            successRate: row.total > 0 ? ((row.geocoded / row.total) * 100).toFixed(1) : '0.0',
                            lastGeocoded: row.last_geocoded
                        });
                    }
                }
            );
        });
    }

    // Update geocoding for a specific property
    async updatePropertyGeocoding(propertyIndex, latitude, longitude, success = true) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE properties 
                 SET latitude = ?, longitude = ?, geocoding_success = ?, geocoded_at = CURRENT_TIMESTAMP
                 WHERE property_index = ?`,
                [latitude, longitude, success ? 1 : 0, propertyIndex],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // Close database connection
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = PropertyDatabase;
