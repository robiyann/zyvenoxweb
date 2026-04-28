const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { requireApiKey } = require('../utils/auth');

/**
 * @swagger
 * /domains:
 *   get:
 *     summary: Get available domains
 *     tags: [Domains]
 *     responses:
 *       200:
 *         description: List of active domains
 */
router.get('/', (req, res) => {
  try {
    const domains = queries.getDomains.all().map(d => d.domain);
    res.json({ domains });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

/**
 * @swagger
 * /domains:
 *   post:
 *     summary: Add or activate a domain
 *     tags: [Domains]
 *     security:
 *       - api_key: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain:
 *                 type: string
 *     responses:
 *       200:
 *         description: Domain added
 *       401:
 *         description: Unauthorized
 */
router.post('/', requireApiKey, (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  try {
    queries.upsertDomain.run({ domain: domain.toLowerCase().trim() });
    res.json({ success: true, message: `Domain ${domain} added/activated` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add domain' });
  }
});

/**
 * @swagger
 * /domains/bulk:
 *   post:
 *     summary: Bulk add multiple domains
 *     tags: [Domains]
 *     security:
 *       - api_key: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domains:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Domains added successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/bulk', requireApiKey, (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'Array of domains is required' });
  }
  
  try {
    let added = 0;
    for (const d of domains) {
      if (typeof d === 'string' && d.trim()) {
        queries.upsertDomain.run({ domain: d.trim().toLowerCase() });
        added++;
      }
    }
    res.json({ success: true, message: `Successfully added ${added} domains` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add domains in bulk' });
  }
});

/**
 * @swagger
 * /domains/{domain}:
 *   delete:
 *     summary: Delete a domain from the database
 *     tags: [Domains]
 *     security:
 *       - api_key: []
 *     parameters:
 *       - in: path
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/:domain', requireApiKey, (req, res) => {
  const { domain } = req.params;
  try {
    const result = queries.deleteDomain.run({ domain: domain.toLowerCase() });
    if (result.changes === 0) return res.status(404).json({ error: 'Domain not found' });
    res.json({ success: true, message: `Domain ${domain} removed` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove domain' });
  }
});

module.exports = router;
