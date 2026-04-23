const express = require('express');
const crypto = require('crypto');
const simpleParser = require('mailparser').simpleParser;
const router = express.Router();
const queries = require('../db/queries');

/**
 * @swagger
 * /inbound:
 *   post:
 *     summary: Webhook to receive raw email from Cloudflare Worker
 *     tags: [Inbound]
 *     security:
 *       - api_key: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *               from:
 *                 type: string
 *               raw:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email processed
 *       401:
 *         description: Unauthorized
 */
router.post('/', async (req, res) => {
  // Verify secret
  const secret = req.headers['x-inbound-secret'];
  if (!process.env.INBOUND_SECRET || secret !== process.env.INBOUND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, from, raw } = req.body;
  if (!to || !raw) {
    return res.status(400).json({ error: 'Missing to or raw email data' });
  }

  try {
    // Parse raw email
    const parsed = await simpleParser(raw);
    
    // Determine address and domain
    // to usually looks like "name@domain.com" or "Some Name <name@domain.com>"
    let address = to.toLowerCase();
    const match = address.match(/<([^>]+)>/);
    if (match) {
      address = match[1];
    }
    
    const domainPart = address.split('@')[1];
    if (!domainPart) {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    const id = crypto.randomUUID();
    const now = new Date();
    
    const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '24', 10);
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    queries.insertEmail.run({
      id,
      address,
      domain: domainPart,
      from_addr: parsed.from?.value?.[0]?.address || from || '',
      from_name: parsed.from?.value?.[0]?.name || '',
      subject: parsed.subject || '(No Subject)',
      body_text: parsed.text || '',
      body_html: parsed.html || '',
      raw: raw,
      received_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error('Error processing inbound email:', err);
    res.status(500).json({ error: 'Failed to process email' });
  }
});

module.exports = router;
