const { verifyToken } = require('./jwtUtils');

/**
 * Middleware to authenticate JWT token
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid token format. Use: Bearer <token>' });
  }
  
  const token = parts[1];
  
  try {
    let decoded;
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
    
    // Try to verify with regional secret first
    try {
      decoded = verifyToken(token);
    } catch (error) {
      // If regional secret fails and API key is present, try admin secret
      if (apiKey) {
        const jwt = require('jsonwebtoken');
        const adminSecret = process.env.ADMIN_JWT_SECRET || 'admin_jwt_secret_key_dev_admin';
        try {
          decoded = jwt.verify(token, adminSecret);
          console.log(`✅ Token verified with admin secret`);
        } catch (adminError) {
          return res.status(403).json({ error: 'Invalid or expired token' });
        }
      } else {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
    }
    
    // Check if token is for correct region (allow 'admin' region if API key present)
    const isAdminAccess = decoded.region === 'admin' && apiKey;
    
    // Verify API key if admin access
    if (isAdminAccess) {
      const expectedApiKey = process.env.API_KEY || 'china_api_key_change_in_production';
      if (apiKey !== expectedApiKey) {
        console.log(`❌ Invalid API key from admin. Expected: ${expectedApiKey}, Got: ${apiKey || 'none'}`);
        return res.status(403).json({ error: 'Invalid API key' });
      }
      console.log(`✅ Admin access granted with valid API key`);
    } else if (decoded.region !== process.env.REGION) {
      return res.status(403).json({ 
        error: 'Invalid token region',
        expected: process.env.REGION,
        received: decoded.region
      });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware to require specific roles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }
    
    next();
  };
}

/**
 * Optional authentication (doesn't fail if no token)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Invalid token, but continue anyway
      req.user = null;
    }
  }
  
  next();
}

module.exports = {
  authenticateJWT,
  requireRole,
  optionalAuth
};

