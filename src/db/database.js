const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'mail.db'));

// Configure for performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    domain TEXT NOT NULL,
    from_addr TEXT,
    from_name TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    raw TEXT,
    read INTEGER DEFAULT 0,
    received_at TEXT NOT NULL,
    expires_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_emails_address ON emails(address);
  CREATE INDEX IF NOT EXISTS idx_emails_expires_at ON emails(expires_at);

  CREATE TABLE IF NOT EXISTS domains (
    domain TEXT PRIMARY KEY,
    label TEXT,
    active INTEGER DEFAULT 1
  );
`);

// Seed domains from environment
const domainsEnv = process.env.DOMAINS || '';
const domains = domainsEnv.split(',').map(d => d.trim()).filter(Boolean);

db.transaction(() => {
  // Mark all existing domains as inactive first
  db.prepare('UPDATE domains SET active = 0').run();
  
  const upsertDomain = db.prepare('INSERT INTO domains (domain, active) VALUES (@domain, 1) ON CONFLICT(domain) DO UPDATE SET active = 1');
  for (const dom of domains) {
    upsertDomain.run({ domain: dom });
  }
})();

module.exports = db;
