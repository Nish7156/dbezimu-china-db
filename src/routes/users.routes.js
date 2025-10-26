const express = require('express');
const { pool } = require('../database/dbConnection');
const { authenticateJWT, requireRole } = require('../auth/authMiddleware');
const { validateApiKey } = require('../auth/apiKeyMiddleware');

const router = express.Router();

/**
 * GET /api/users
 * Get all users (India only)
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, full_name, phone, country, role, created_at, last_login
       FROM users
       WHERE is_active = true
       ORDER BY id DESC`
    );
    
    res.json({ 
      success: true,
      region: 'india',
      users: result.rows 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/users (Admin access with API key)
 */
router.get('/admin', validateApiKey, authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM users ORDER BY id DESC`
    );
    
    res.json({ 
      success: true,
      region: 'india',
      users: result.rows 
    });
  } catch (error) {
    console.error('Error fetching users (admin):', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

