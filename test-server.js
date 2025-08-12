const express = require('express');
const app = express();
const PORT = 3002;

app.use(express.json());

// Minimal force refresh endpoint for testing
app.post('/api/force-refresh/:county', async (req, res) => {
    console.log(`Force refresh test for: ${req.params.county}`);
    
    try {
        // Simple response
        res.json({ 
            success: true, 
            county: req.params.county,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Test server working' });
});

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});

// Error handlers
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
