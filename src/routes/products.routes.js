const express = require('express');
const { pool } = require('../database/dbConnection');
const { authenticateJWT, requireRole } = require('../auth/authMiddleware');
const { validateApiKey } = require('../auth/apiKeyMiddleware');

const router = express.Router();

/**
 * GET /api/products
 * Get all products (created in China)
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.product_name, p.description, p.price, p.stock_quantity, p.category, 
              p.manufacturer_country, p.created_by_user_id, p.sync_source, p.updated_at,
              u.username as creator_username, u.full_name as creator_name
       FROM products p
       LEFT JOIN users u ON p.created_by_user_id = u.id
       ORDER BY p.id DESC LIMIT 100`
    );
    
    res.json({ 
      success: true,
      region: 'china',
      products: result.rows 
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/products
 * Create a new product (China only)
 */
router.post('/', authenticateJWT, requireRole('manufacturer', 'manager', 'admin'), async (req, res) => {
  try {
    const { product_name, description, price, stock_quantity, category, created_by_user_id } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (product_name, description, price, stock_quantity, category, manufacturer_country, created_by_user_id, sync_source) 
       VALUES ($1, $2, $3, $4, $5, 'China', $6, 'china') 
       RETURNING *`,
      [product_name, description, price, stock_quantity, category, created_by_user_id]
    );
    
    console.log(`✅ Product created: ${product_name} (ID: ${result.rows[0].id})`);
    
    res.json({ 
      success: true, 
      product: result.rows[0] 
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/products/:id
 * Update product (China only)
 */
router.put('/:id', authenticateJWT, requireRole('manufacturer', 'manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { product_name, description, price, stock_quantity, category } = req.body;
    
    const result = await pool.query(
      `UPDATE products 
       SET product_name = COALESCE($1, product_name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           stock_quantity = COALESCE($4, stock_quantity),
           category = COALESCE($5, category),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [product_name, description, price, stock_quantity, category, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    console.log(`✅ Product updated: ${result.rows[0].product_name} (ID: ${id})`);
    
    res.json({ 
      success: true, 
      product: result.rows[0] 
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/products (Admin access)
 */
router.get('/admin', validateApiKey, authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products ORDER BY id DESC LIMIT 200`
    );
    
    res.json({ 
      success: true,
      region: 'china',
      products: result.rows 
    });
  } catch (error) {
    console.error('Error fetching products (admin):', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

