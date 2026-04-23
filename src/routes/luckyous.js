const express = require('express');
const router = express.Router();

// Proxy API Luckyous untuk menghindari bloking CORS di browser frontend
router.get('/:token/mails', async (req, res) => {
    try {
        const token = req.params.token;
        const apiUrl = `https://mails.luckyous.com/api/v1/openapi/email/token/${token}/mails`;
        
        // Gunakan global fetch (Native di Node v18+)
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[Luckyous Proxy Error]', error);
        res.status(500).json({ error: error.message || 'Internal Server Error fetching from Luckyous API' });
    }
});

module.exports = router;
