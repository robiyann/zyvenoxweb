require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger');
const queries = require('./db/queries');

const app = express();
const PORT = process.env.PORT || 3721;
const API_KEY = process.env.API_KEY;

// ─── CORS ────────────────────────────────────────────────────────────────────
// Open - anyone can read their own mailbox if they know the address.
// Only inbound writes are protected via INBOUND_SECRET.
app.use(cors());

// ─── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── API Key Middleware ────────────────────────────────────────────────────────
// Protects all /api/* routes EXCEPT /api/inbound (which uses INBOUND_SECRET).
// The UI (SPA) is NOT API-protected since it's served on the same origin.
function requireApiKey(req, res, next) {
  if (!API_KEY) {
    // If no API_KEY set in .env, warn and allow (dev mode fallback)
    console.warn('[SECURITY] No API_KEY set in .env! Requests are unprotected.');
    return next();
  }
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-API-Key header' });
  }
  next();
}

// ─── Swagger Docs (public, user-facing only) ──────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "ZYVENOX API"
}));

// ─── API Routes ───────────────────────────────────────────────────────────────
// /api/inbound: protected by INBOUND_SECRET (only Cloudflare Worker can write)
app.use('/api/inbound', require('./routes/inbound'));
// /api/mailboxes & /api/domains: public - security is the randomness of the address
app.use('/api/domains', require('./routes/domains'));
app.use('/api/mailboxes', require('./routes/mailbox'));
// /api/luckyous: proxy to external luckyous API
app.use('/api/luckyous', require('./routes/luckyous'));

// ─── Static Web UI ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/luckyousmail', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'luckyousmail.html'));
});
// ─── Auto-cleanup hourly ──────────────────────────────────────────────────────
setInterval(() => {
  try {
    const now = new Date().toISOString();
    const result = queries.cleanupExpiredEmails.run({ now });
    if (result.changes > 0) {
      console.log(`[Cleanup] Deleted ${result.changes} expired emails.`);
    }
  } catch (err) {
    console.error('[Cleanup] Error deleting expired emails:', err);
  }
}, 60 * 60 * 1000);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 CF Mail Server running on http://127.0.0.1:${PORT}`);
  console.log(`📚 API Docs available at http://127.0.0.1:${PORT}/docs`);
  if (!API_KEY) {
    console.warn('⚠️  WARNING: API_KEY is not set! Add API_KEY=your_secret to .env to protect your API.');
  }
});

