const { Pool } = require('pg');
const config = require('../config/config');

// Create connection pool for China database
// Enable SSL for Render PostgreSQL
const pool = new Pool({
  ...config.db,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('✅ Connected to China database');
});

pool.on('error', (err) => {
  console.error('❌ China database error:', err);
});

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    return { success: true, timestamp: result.rows[0].now };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  pool,
  testConnection
};

