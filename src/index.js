const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const { initKafkaConsumers } = require('./kafka/consumer');
const { testConnection } = require('./database/dbConnection');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting (very relaxed for load testing)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5000, // Increased for load testing
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Routes
const authRoutes = require('./routes/auth.routes');
const productsRoutes = require('./routes/products.routes');
const salesRoutes = require('./routes/sales.routes');
const usersRoutes = require('./routes/users.routes');
const statsRoutes = require('./routes/stats.routes');

// Public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/health', async (req, res) => {
  const dbHealth = await testConnection();
  res.status(dbHealth.success ? 200 : 503).json({
    status: dbHealth.success ? 'healthy' : 'unhealthy',
    region: config.region,
    database: dbHealth.success ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stats', statsRoutes);

// API info
app.get('/api', (req, res) => {
  res.json({
    service: 'China Backend API',
    version: '2.0.0',
    region: config.region,
    status: 'running',
    authentication: 'JWT required',
    endpoints: {
      public: [
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'GET /health'
      ],
      protected: [
        'GET /api/products',
        'POST /api/products',
        'PUT /api/products/:id',
        'GET /api/sales',
        'GET /api/users',
        'GET /api/stats',
        'GET /api/stats/sync'
      ],
      admin: [
        'GET /api/products/admin',
        'GET /api/sales/admin',
        'GET /api/users/admin'
      ]
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting China Backend...');
    console.log(`📍 Region: ${config.region}`);
    console.log(`🌐 Port: ${config.port}`);
    
    // Test database connection
    const dbTest = await testConnection();
    if (!dbTest.success) {
      console.error('❌ Database connection failed:', dbTest.error);
      process.exit(1);
    }
    console.log('✅ Database connected');
    
    // Initialize Kafka consumers
    try {
      await initKafkaConsumers();
      console.log('✅ Kafka consumers initialized');
    } catch (error) {
      console.error('⚠️  Kafka initialization failed:', error.message);
      console.log('⚠️  Continuing without Kafka (sync disabled)');
    }
    
    // Start Express server
    app.listen(config.port, () => {
      console.log(`✅ China Backend running on port ${config.port}`);
      console.log(`📊 Health check: http://localhost:${config.port}/health`);
      console.log(`🔐 Authentication: JWT required for protected endpoints`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start
startServer();

