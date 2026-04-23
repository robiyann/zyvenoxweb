const db = require('./database');

// Queries
const queries = {
  getDomains: db.prepare('SELECT domain FROM domains WHERE active = 1'),
  
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
  `)
};

module.exports = queries;
