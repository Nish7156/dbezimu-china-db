const jwt = require('jsonwebtoken');

/**
 * Generate JWT access token
 */
function generateAccessToken(user, region) {
  const payload = {
    user_id: user.id,
    username: user.username,
    role: user.role,
    region: region,
    type: 'access'
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '1h' }
  );
}

/**
 * Generate JWT refresh token
 */
function generateRefreshToken(user, region) {
  const payload = {
    user_id: user.id,
    username: user.username,
    region: region,
    type: 'refresh'
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken
};

