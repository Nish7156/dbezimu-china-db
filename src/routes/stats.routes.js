const express = require('express');
const { pool } = require('../database/dbConnection');
const { authenticateJWT } = require('../auth/authMiddleware');
const { syncMetrics } = require('../utils/syncMetrics');

const router = express.Router();

/**
 * GET /api/stats
 * Get statistics for China region
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE is_active = true');
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    const salesCount = await pool.query('SELECT COUNT(*) FROM sales');
    const salesRevenue = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as revenue FROM sales');
    
    res.json({
      success: true,
      region: 'china',
      users: {
        count: parseInt(usersCount.rows[0].count)
      },
      products: {
        count: parseInt(productsCount.rows[0].count)
      },
      sales: {
        count: parseInt(salesCount.rows[0].count),
        revenue: parseFloat(salesRevenue.rows[0].revenue)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sync-stats
 * Get sync metrics for China (receives from India)
 */
router.get('/sync', authenticateJWT, async (req, res) => {
  try {
    const stats = syncMetrics.getChinaStats();
    res.json({
      success: true,
      region: 'china',
      receives_from: 'india',
      ...stats
    });
  } catch (error) {
    console.error('Error getting sync stats:', error);
    res.status(500).json({ error: 'Failed to get sync stats' });
  }
});

module.exports = router;

