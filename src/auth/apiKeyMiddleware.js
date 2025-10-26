/**
 * Middleware to validate API key for backend-to-backend communication
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'No API key provided' });
  }
  
  const expectedKey = process.env.API_KEY;
  
  if (!expectedKey) {
    console.error('⚠️  API_KEY not configured in environment');
    return res.status(500).json({ error: 'API key not configured' });
  }
  
  if (apiKey !== expectedKey) {
    console.warn(`⚠️  Invalid API key attempt: ${apiKey.substring(0, 10)}...`);
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  console.log('✅ API key validated');
  next();
}

/**
 * Combined middleware: Require both JWT and API key (for admin endpoints)
 */
function requireAdminAuth(authenticateJWT) {
  return (req, res, next) => {
    validateApiKey(req, res, () => {
      authenticateJWT(req, res, next);
    });
  };
}

module.exports = {
  validateApiKey,
  requireAdminAuth
};

