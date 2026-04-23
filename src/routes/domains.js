const express = require('express');
const router = express.Router();
const queries = require('../db/queries');

/**
 * @swagger
 * /domains:
 *   get:
 *     summary: Get available domains
 *     tags: [Domains]
 *     responses:
 *       200:
 *         description: List of active domains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 domains:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/', (req, res) => {
  try {
    const domains = queries.getDomains.all().map(d => d.domain);
    res.json({ domains });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

module.exports = router;
