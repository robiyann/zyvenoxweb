function requireApiKey(req, res, next) {
  const API_KEY = process.env.API_KEY;
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

module.exports = { requireApiKey };
