const mysql = require('mysql2');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'smartmail_agent',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

const db = pool.promise();

db.getConnection()
  .then(async conn => {
    console.log('MySQL connected successfully');
    try {
      await conn.execute(
        'ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS last_fetched_uid INT DEFAULT 0'
      );
      console.log('[DB] Migration: last_fetched_uid column ensured.');
    } catch (migErr) {
      console.warn('[DB] Migration warning:', migErr.message);
    }
    try {
      await conn.execute(
        'UPDATE agent_settings SET last_fetched_uid = 0 WHERE last_fetched_uid = 2971'
      );
      console.log('[DB] Reset: last_fetched_uid cleared for full re-fetch.');
    } catch (resetErr) {
      console.warn('[DB] Reset warning:', resetErr.message);
    }
    conn.release();
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
  });

module.exports = db;
