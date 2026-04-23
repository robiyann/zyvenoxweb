const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const queries = require('../db/queries');

// Helper to validate and extract domain
function isValidDomain(domain) {
  const domains = queries.getDomains.all().map(d => d.domain);
  return domains.includes(domain);
}


const { generateHumanReadableId } = require('../utils/random');

/**
 * @swagger
 * /mailboxes/generate:
 *   post:
 *     summary: Generate a random email address
 *     tags: [Mailboxes]
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
 *         description: The generated email address
 */
router.post('/generate', (req, res) => {
  const { domain } = req.body;
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid or missing domain' });
  }
  const prefix = generateHumanReadableId();
  const address = `${prefix}@${domain}`;
  res.json({ address });
});

/**
 * @swagger
 * /mailboxes/custom:
 *   post:
 *     summary: Register a custom email address
 *     tags: [Mailboxes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain:
 *                 type: string
 *               prefix:
 *                 type: string
 *     responses:
 *       200:
 *         description: The custom email address
 */
router.post('/custom', (req, res) => {
  const { domain, prefix } = req.body;
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid or missing domain' });
  }
  if (!prefix || typeof prefix !== 'string' || !/^[a-zA-Z0-9.\-_]+$/.test(prefix)) {
    return res.status(400).json({ error: 'Invalid prefix format' });
  }
  const address = `${prefix}@${domain}`;
  
  res.json({ address });
});

/**
 * @swagger
 * /mailboxes/{address}/otp:
 *   get:
 *     summary: Extract OTP/code from the latest email
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *         description: Pre-defined regex service (e.g. 'gopay', 'openai')
 *       - in: query
 *         name: regex
 *         schema:
 *           type: string
 *         description: Custom regex to extract value (e.g. '\b\d{6}\b')
 *     responses:
 *       200:
 *         description: OTP successfully extracted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 otp:
 *                   type: string
 *                 from:
 *                   type: string
 *                 date:
 *                   type: string
 *       404:
 *         description: Email or OTP not found
 */
router.get('/:address/otp', (req, res) => {
  const { address } = req.params;
  const { service, regex } = req.query;

  try {
    const emails = queries.getEmailsByAddress.all({ address });
    if (!emails || emails.length === 0) {
      return res.status(404).json({ error: 'No emails found for this address' });
    }

    const latestMeta = emails[0];
    const email = queries.getEmailByIdAndAddress.get({ id: latestMeta.id, address });
    if (!email) {
      return res.status(404).json({ error: 'Email details not found' });
    }

    const content = (email.body_text || email.body_html || '').toString();
    
    // Default pattern: 4 to 6 digit numbers bounded by word boundaries
    let pattern = /\b\d{4,6}\b/;

    if (regex) {
      pattern = new RegExp(regex);
    } else if (service) {
      const s = service.toLowerCase();
      if (s === 'gopay') pattern = /code is (\d{4})/;
      else if (s === 'openai') pattern = /\b\d{6}\b/;
      // Add more here if needed
    }

    const match = content.match(pattern);
    if (match) {
      // If regex has a capture group like gopay, match[1] holds the code. Otherwise match[0]
      const otp = match[1] ? match[1] : match[0];
      return res.json({ 
        otp, 
        from: email.from_name || email.from_addr, 
        date: email.received_at 
      });
    }

    return res.status(404).json({ error: 'OTP not found in the latest email' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to extract OTP' });
  }
});

/**
 * @swagger
 * /mailboxes/{address}:
 *   get:
 *     summary: Get emails for a specific address
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of emails
 */
router.get('/:address', (req, res) => {
  const { address } = req.params;
  try {
    const emails = queries.getEmailsByAddress.all({ address });
    res.json({ address, count: emails.length, emails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

/**
 * @swagger
 * /mailboxes/{address}/{id}:
 *   get:
 *     summary: Get a specific email
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The email content
 *       404:
 *         description: Email not found
 */
router.get('/:address/:id', (req, res) => {
  const { address, id } = req.params;
  try {
    const email = queries.getEmailByIdAndAddress.get({ address, id });
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    // Mark as read
    if (!email.read) {
      queries.markEmailAsRead.run({ address, id });
      email.read = 1;
    }
    res.json(email);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

/**
 * @swagger
 * /mailboxes/{address}/{id}:
 *   delete:
 *     summary: Delete a specific email
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email deleted
 */
router.delete('/:address/:id', (req, res) => {
  const { address, id } = req.params;
  try {
    const result = queries.deleteEmail.run({ address, id });
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

/**
 * @swagger
 * /mailboxes/{address}:
 *   delete:
 *     summary: Delete all emails in a mailbox
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inbox cleared
 */
router.delete('/:address', (req, res) => {
  const { address } = req.params;
  try {
    const result = queries.deleteAllEmailsByAddress.run({ address });
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear inbox' });
  }
});

module.exports = router;
