/**
 * Centralized environment configuration with validation
 * Used by all backend services
 */
const path = require('path');

// Load .env from overview-api directory (contains all service env vars)
// Using explicit path ensures dotenv finds .env regardless of PM2's working directory
require('dotenv').config({ path: path.join(__dirname, '../overview-api/.env') });

// Validation helper
function requireEnv(key, fallback = null) {
  const value = process.env[key] || fallback;

  // In production, don't allow fallbacks for sensitive data
  if (process.env.NODE_ENV === 'production' && !process.env[key] && !fallback) {
    console.warn(`WARNING: ${key} not set in environment`);
  }

  return value;
}

// V2 Database Configuration
const config = {
  db: {
    user: requireEnv('DB_USER', 'postgres'),
    host: requireEnv('DB_HOST', 'localhost'),
    database: requireEnv('DB_NAME', 'settlepaisa_v2'),
    password: requireEnv('DB_PASSWORD', 'settlepaisa123'),
    port: parseInt(requireEnv('DB_PORT', '5432')),
  },

  // SabPaisa V1 Database
  sabpaisaDb: {
    user: requireEnv('SABPAISA_DB_USER', 'settlepaisainternal'),
    host: requireEnv('SABPAISA_DB_HOST', '3.108.237.99'),
    database: requireEnv('SABPAISA_DB_NAME', 'sabpaisa_prod'),
    password: requireEnv('SABPAISA_DB_PASSWORD', 'sabpaisa123'),
    port: parseInt(requireEnv('SABPAISA_DB_PORT', '5432')),
  },

  // Authentication
  auth: {
    jwtSecret: requireEnv('JWT_SECRET', 'your-secret-key-change-this-in-production'),
    sessionSecret: requireEnv('SESSION_SECRET', 'session-secret-change-in-production'),
  },

  // Webhooks
  webhooks: {
    razorpay: requireEnv('RAZORPAY_WEBHOOK_SECRET', 'webhook_secret'),
    payu: requireEnv('PAYU_WEBHOOK_SECRET', 'webhook_secret'),
    paytm: requireEnv('PAYTM_WEBHOOK_SECRET', 'webhook_secret'),
  },

  // Application
  app: {
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    port: parseInt(requireEnv('PORT', '5108')),
    logLevel: requireEnv('LOG_LEVEL', 'info'),
  },
};

// Validate JWT secret strength (Security Fix: HIGH-003)
function validateJwtSecret() {
  const secret = config.auth.jwtSecret;
  const minLength = 64;

  if (config.app.nodeEnv === 'production') {
    // In production, enforce strong JWT secret
    if (!secret || secret === 'your-secret-key-change-this-in-production') {
      console.error('❌ FATAL: JWT_SECRET not set or using default value in production!');
      console.error('   Set a strong JWT_SECRET (minimum 64 characters) in environment variables.');
      process.exit(1);
    }

    if (secret.length < minLength) {
      console.error(`❌ FATAL: JWT_SECRET too weak! Must be at least ${minLength} characters.`);
      console.error(`   Current length: ${secret.length} characters`);
      console.error('   Generate a strong secret with: openssl rand -base64 64');
      process.exit(1);
    }

    console.log('✅ JWT secret validation passed:', {
      length: secret.length,
      strong: secret.length >= minLength
    });
  } else {
    // In development, warn but don't exit
    if (secret.length < minLength) {
      console.warn(`⚠️  WARNING: JWT_SECRET is weak (${secret.length} chars). Use 64+ chars in production.`);
    }
  }
}

// Run validation on startup
validateJwtSecret();

// Log configuration on startup (hide passwords)
console.log('[Config] Environment loaded:', {
  nodeEnv: config.app.nodeEnv,
  dbHost: config.db.host,
  dbName: config.db.database,
  sabpaisaHost: config.sabpaisaDb.host,
  sabpaisaDb: config.sabpaisaDb.database,
});

module.exports = config;
