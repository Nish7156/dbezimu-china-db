const express = require('express');
const { pool } = require('../database/dbConnection');
const { authenticateJWT } = require('../auth/authMiddleware');
const { validateApiKey } = require('../auth/apiKeyMiddleware');

const router = express.Router();

/**
 * GET /api/sales
 * Get all sales (synced from India)
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.sale_date, s.product_id, s.product_name, s.quantity, s.unit_price,
              s.total_amount, s.customer_name, s.sale_region, s.sync_source, s.created_at
       FROM sales s
       ORDER BY s.id DESC LIMIT 100`
    );
    
    res.json({ 
      success: true,
      region: 'china',
      sales: result.rows 
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/sales (Admin access)
 */
router.get('/admin', validateApiKey, authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM sales ORDER BY id DESC LIMIT 200`
    );
    
    res.json({ 
      success: true,
      region: 'china',
      sales: result.rows 
    });
  } catch (error) {
    console.error('Error fetching sales (admin):', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

