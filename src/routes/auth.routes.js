const express = require('express');
const { pool } = require('../database/dbConnection');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../auth/passwordUtils');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../auth/jwtUtils');
const { authenticateJWT } = require('../auth/authMiddleware');
const config = require('../config/config');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login user and return JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Query user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Check if password hash exists
    if (!user.password_hash) {
      return res.status(401).json({ 
        error: 'Account not setup. Please contact administrator to set password.' 
      });
    }
    
    // Verify password
    const validPassword = await comparePassword(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user, config.region);
    const refreshToken = generateRefreshToken(user, config.region);
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    console.log(`✅ User logged in: ${username} (region: ${config.region})`);
    
    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        region: config.region
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    
    if (decoded.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    // Get user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }
    
    const user = result.rows[0];
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user, config.region);
    
    res.json({
      success: true,
      accessToken: newAccessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, country, last_login FROM users WHERE id = $1',
      [req.user.user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateJWT, async (req, res) => {
  // In a more advanced implementation, you could blacklist the token
  // For now, client just removes the token
  console.log(`✅ User logged out: ${req.user.username}`);
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticateJWT, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    
    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Get user
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Verify current password
    const validPassword = await comparePassword(currentPassword, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    
    // Hash new password
    const newHash = await hashPassword(newPassword);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, user.id]
    );
    
    console.log(`✅ Password changed for user: ${user.username}`);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;
    
    // Validation
    if (!username || !password || !full_name || !email) {
      return res.status(400).json({ error: 'Username, password, full name, and email are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if username or email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const password_hash = await hashPassword(password);
    
    // Set default role if not provided (manufacturer for China)
    const userRole = role || 'manufacturer';
    
    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, phone, role, country, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'China', true)
       RETURNING id, username, full_name, email, phone, role, country, created_at`,
      [username, password_hash, full_name, email, phone, userRole]
    );
    
    const user = result.rows[0];
    
    // Generate JWT tokens
    const accessToken = generateAccessToken(user, config.region);
    const refreshToken = generateRefreshToken(user, config.region);
    
    console.log(`✅ New user registered: ${username} (${userRole}) in China`);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to China Store.',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        region: 'china'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

module.exports = router;

