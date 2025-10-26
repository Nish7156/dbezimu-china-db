require('dotenv').config();

module.exports = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  region: process.env.REGION || 'china',
  
  // Database
  db: {
    host: process.env.DB_HOST || 'postgres-china',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'china_db',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'admin123',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'china_jwt_secret_change_in_production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  
  // API Key (for admin access)
  apiKey: process.env.API_KEY || 'china_api_key_change_in_production',
  
  // Kafka - Hardcoded for Render deployment
  kafka: {
    broker: process.env.KAFKA_BROKER || '31.97.232.235:9092',
    clientId: 'china-backend',
    groupId: 'china-sync-consumer',
    // Additional Kafka client configuration
    retry: {
      initialRetryTime: 300,
      retries: 15,
      maxRetryTime: 30000,
      multiplier: 2
    }
  }
};

