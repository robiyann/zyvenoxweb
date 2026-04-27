const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const queries = require('../db/queries');
const { requireApiKey } = require('../utils/auth');

// Helper to validate and extract domain
function isValidDomain(domain) {
  const domains = queries.getDomains.all().map(d => d.domain);
  return domains.includes(domain);
}

// ─── Round-Robin Domain Rotator ──────────────────────────────────────────────
// Counter in-memory — berputar adil melalui semua domain aktif
let _rrCounter = 0;
function getNextDomainRoundRobin() {
  const domains = queries.getDomains.all().map(d => d.domain);
  if (!domains || domains.length === 0) throw new Error('No active domains available');
  const domain = domains[_rrCounter % domains.length];
  _rrCounter++;
  if (_rrCounter >= Number.MAX_SAFE_INTEGER) _rrCounter = 0; // reset supaya tidak overflow
  console.log(`[RR] Domain terpilih: ${domain} (counter: ${_rrCounter}, total: ${domains.length})`);
  return domain;
}
// ─────────────────────────────────────────────────────────────────────────────

const { generateHumanReadableId } = require('../utils/random');

// Helper to generate a unique token
function generateToken(domain) {
  const domainPrefix = domain.split('.')[0].replace(/[^a-z0-9]/g, '').toLowerCase();
  const randomStr = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  return `${domainPrefix}_${randomStr}`;
}

// Helper to save token mapping
function saveToken(token, address) {
  const now = new Date();
  const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '24', 10);
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  
  queries.insertToken.run({
    token,
    address,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  });
}

/**
 * @swagger
 * /mailboxes/generate:
 *   post:
 *     summary: Generate a random email address and token
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
 *         description: The generated email address and access token
 */
router.post('/generate', requireApiKey, (req, res) => {
  const { domain } = req.body;
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid or missing domain' });
  }
  const prefix = generateHumanReadableId();
  const address = `${prefix}@${domain}`;
  const token = generateToken(domain);
  
  try {
    saveToken(token, address);
    res.json({ address, token });
  } catch (err) {
    console.error('Failed to save token:', err);
    res.status(500).json({ error: 'Failed to generate mailbox token' });
  }
});

/**
 * @swagger
 * /mailboxes/generate/auto:
 *   post:
 *     summary: Auto-generate email using round-robin domain rotation
 *     description: Server picks the next domain in rotation automatically — no domain param needed.
 *     tags: [Mailboxes]
 *     responses:
 *       200:
 *         description: The generated email address, domain used, and access token
 */
router.post('/generate/auto', requireApiKey, (req, res) => {
  try {
    const domain = getNextDomainRoundRobin();
    const prefix = generateHumanReadableId();
    const address = `${prefix}@${domain}`;
    const token = generateToken(domain);
    saveToken(token, address);
    res.json({ address, token, domain });
  } catch (err) {
    console.error('[RR] Failed to auto-generate mailbox:', err);
    res.status(500).json({ error: err.message || 'Failed to auto-generate mailbox' });
  }
});

/**
 * @swagger
 * /mailboxes/custom:
 *   post:
 *     summary: Register a custom email address and get a token
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
 *         description: The custom email address and access token
 */
router.post('/custom', requireApiKey, (req, res) => {
  const { domain, prefix } = req.body;
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid or missing domain' });
  }
  if (!prefix || typeof prefix !== 'string' || !/^[a-zA-Z0-9.\-_]+$/.test(prefix)) {
    return res.status(400).json({ error: 'Invalid prefix format' });
  }
  const address = `${prefix}@${domain}`;
  const token = generateToken(domain);
  
  try {
    saveToken(token, address);
    res.json({ address, token });
  } catch (err) {
    console.error('Failed to save token:', err);
    res.status(500).json({ error: 'Failed to generate mailbox token' });
  }
});

// ─── Token Based Endpoints ───────────────────────────────────────────────────

/**
 * @swagger
 * /mailboxes/token/{token}:
 *   get:
 *     summary: Get emails via token
 *     description: Retrieve all emails associated with a specific access token.
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The access token (e.g. outlook_randomhex)
 *     responses:
 *       200:
 *         description: List of emails
 *       404:
 *         description: Invalid or expired token
 */
router.get('/token/:token', (req, res) => {
  const { token } = req.params;
  try {
    const row = queries.getAddressByToken.get({ token, now: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Invalid or expired token' });
    
    const address = row.address;
    const emails = queries.getEmailsByAddress.all({ address });
    res.json({ address, token, count: emails.length, emails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emails via token' });
  }
});

/**
 * @swagger
 * /mailboxes/token/{token}/otp:
 *   get:
 *     summary: Extract OTP/code via token
 *     description: Automatically extracts numeric codes or OTPs from the latest email using regex.
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: service
 *         schema:
 *           type: string
 *         description: Pre-defined service (gopay, openai)
 *       - in: query
 *         name: regex
 *         schema:
 *           type: string
 *         description: Custom regex pattern
 *     responses:
 *       200:
 *         description: Extracted OTP
 *       404:
 *         description: Not found
 */
router.get('/token/:token/otp', (req, res) => {
  const { token } = req.params;
  const { service, regex } = req.query;

  try {
    const row = queries.getAddressByToken.get({ token, now: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Invalid or expired token' });
    const address = row.address;

    const emails = queries.getEmailsByAddress.all({ address });
    if (!emails || emails.length === 0) {
      return res.status(404).json({ error: 'No emails found' });
    }

    const latestMeta = emails[0];
    const email = queries.getEmailByIdAndAddress.get({ id: latestMeta.id, address });
    
    // Prioritaskan body_text, jika kosong coba body_html (strip tags)
    let content = '';
    if (email.body_text && email.body_text.trim().length > 0) {
      content = email.body_text;
    } else if (email.body_html) {
      // Strip HTML tags untuk ekstrak teks
      content = email.body_html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    }
    content = content.toString();

    console.log(`[OTP] Mencari OTP di email dari ${email.from_addr || 'unknown'}, subject: "${email.subject || ''}", content length: ${content.length}`);

    let pattern = /\b\d{4,6}\b/;
    if (regex) pattern = new RegExp(regex);
    else if (service) {
      const s = service.toLowerCase();
      if (s === 'gopay') pattern = /code is (\d{4})/;
      else if (s === 'openai') pattern = /\b(\d{6})\b/;
    }

    const match = content.match(pattern);
    if (match) {
      const otp = match[1] ? match[1] : match[0];
      console.log(`[OTP] Ditemukan OTP: ${otp}`);
      return res.json({ otp, from: email.from_name || email.from_addr, date: email.received_at });
    }
    console.log(`[OTP] OTP tidak ditemukan dalam konten email (pola: ${pattern})`);
    return res.status(404).json({ error: 'OTP not found' });
  } catch (error) {
    console.error('[OTP] Error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

/**
 * @swagger
 * /mailboxes/token/{token}/{id}:
 *   get:
 *     summary: Get a specific email via token
 *     description: Retrieve full email content (HTML/Text) for a specific email ID.
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: token
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
 *         description: Email content
 */
router.get('/token/:token/:id', (req, res) => {
  const { token, id } = req.params;
  try {
    const row = queries.getAddressByToken.get({ token, now: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Invalid token' });
    
    const email = queries.getEmailByIdAndAddress.get({ address: row.address, id });
    if (!email) return res.status(404).json({ error: 'Email not found' });
    
    if (!email.read) {
      queries.markEmailAsRead.run({ address: row.address, id });
      email.read = 1;
    }
    res.json(email);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

/**
 * @swagger
 * /mailboxes/token/{token}/{id}:
 *   delete:
 *     summary: Delete a specific email via token
 *     tags: [Mailboxes]
 */
router.delete('/token/:token/:id', (req, res) => {
  const { token, id } = req.params;
  try {
    const row = queries.getAddressByToken.get({ token, now: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Invalid token' });
    
    const result = queries.deleteEmail.run({ address: row.address, id });
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

/**
 * @swagger
 * /mailboxes/token/{token}:
 *   delete:
 *     summary: Clear inbox via token
 *     tags: [Mailboxes]
 */
router.delete('/token/:token', (req, res) => {
  const { token } = req.params;
  try {
    const row = queries.getAddressByToken.get({ token, now: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Invalid token' });
    
    const result = queries.deleteAllEmailsByAddress.run({ address: row.address });
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});


// ─── Admin / Recovery Endpoints (Requires API Key) ──────────────────────────

/**
 * @swagger
 * /mailboxes/admin/address/{address}:
 *   get:
 *     summary: "[ADMIN] Get emails by address directly"
 *     description: Recovery endpoint to access inbox without a token. Requires X-API-Key.
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *     responses:
 *       200:
 *         description: List of emails
 */
router.get('/admin/address/:address', requireApiKey, (req, res) => {
  const { address } = req.params;
  try {
    const emails = queries.getEmailsByAddress.all({ address: address.toLowerCase() });
    res.json({ address, count: emails.length, emails });
  } catch (error) {
    res.status(500).json({ error: 'Admin fetch failed' });
  }
});

/**
 * @swagger
 * /mailboxes/admin/address/{address}/otp:
 *   get:
 *     summary: "[ADMIN] Extract OTP by address directly"
 *     tags: [Mailboxes]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 */
router.get('/admin/address/:address/otp', requireApiKey, (req, res) => {
  const { address } = req.params;
  const { service, regex } = req.query;

  try {
    const emails = queries.getEmailsByAddress.all({ address: address.toLowerCase() });
    if (!emails || emails.length === 0) {
      return res.status(404).json({ error: 'No emails found for this address' });
    }

    const latestMeta = emails[0];
    const email = queries.getEmailByIdAndAddress.get({ id: latestMeta.id, address: address.toLowerCase() });
    
    let content = '';
    if (email.body_text && email.body_text.trim().length > 0) {
      content = email.body_text;
    } else if (email.body_html) {
      content = email.body_html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    }
    content = content.toString();

    let pattern = /\b\d{4,6}\b/;
    if (regex) pattern = new RegExp(regex);
    else if (service) {
      const s = service.toLowerCase();
      if (s === 'gopay') pattern = /code is (\d{4})/;
      else if (s === 'openai') pattern = /\b(\d{6})\b/;
    }

    const match = content.match(pattern);
    if (match) {
      const otp = match[1] ? match[1] : match[0];
      return res.json({ otp, from: email.from_name || email.from_addr, date: email.received_at });
    }
    return res.status(404).json({ error: 'OTP not found' });
  } catch (error) {
    res.status(500).json({ error: 'Admin OTP fetch failed' });
  }
});

module.exports = router;

