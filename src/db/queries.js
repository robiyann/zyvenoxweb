const db = require('./database');

// Queries
const queries = {
  getDomains: db.prepare('SELECT domain FROM domains WHERE active = 1'),
  upsertDomain: db.prepare('INSERT INTO domains (domain, active) VALUES (@domain, 1) ON CONFLICT(domain) DO UPDATE SET active = 1'),
  deleteDomain: db.prepare('DELETE FROM domains WHERE domain = @domain'),
  
  insertEmail: db.prepare(`
    INSERT INTO emails (
      id, address, domain, from_addr, from_name, subject, 
      body_text, body_html, raw, received_at, expires_at
    ) VALUES (
      @id, @address, @domain, @from_addr, @from_name, @subject,
      @body_text, @body_html, @raw, @received_at, @expires_at
    )
  `),
  
  getEmailsByAddress: db.prepare(`
    SELECT id, from_addr, from_name, subject, received_at, read
    FROM emails 
    WHERE address = @address
    ORDER BY received_at DESC
  `),
  
  getEmailByIdAndAddress: db.prepare(`
    SELECT *
    FROM emails
    WHERE id = @id AND address = @address
  `),
  
  markEmailAsRead: db.prepare(`
    UPDATE emails 
    SET read = 1 
    WHERE id = @id AND address = @address
  `),
  
  deleteEmail: db.prepare(`
    DELETE FROM emails
    WHERE id = @id AND address = @address
  `),
  
  deleteAllEmailsByAddress: db.prepare(`
    DELETE FROM emails
    WHERE address = @address
  `),
  
  cleanupExpiredEmails: db.prepare(`
    DELETE FROM emails
    WHERE expires_at <= @now
  `),

  insertToken: db.prepare(`
    INSERT INTO tokens (token, address, created_at, expires_at)
    VALUES (@token, @address, @created_at, @expires_at)
  `),

  getAddressByToken: db.prepare(`
    SELECT address FROM tokens WHERE token = @token AND expires_at > @now
  `),

  cleanupExpiredTokens: db.prepare(`
    DELETE FROM tokens 
    WHERE expires_at <= @now
  `)
};

module.exports = queries;
