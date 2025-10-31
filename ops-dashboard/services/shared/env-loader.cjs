/**
 * Shared Environment Variable Loader
 *
 * Purpose: Centralized, validated environment loading for all services
 *
 * Features:
 * - Loads .env files with correct paths
 * - Validates required variables are set
 * - Prevents services from starting with wrong configuration
 * - Fails fast with clear error messages
 * - Works correctly regardless of PM2 working directory
 *
 * Usage:
 *   const { loadEnv, validateConfig } = require('../shared/env-loader.cjs');
 *   loadEnv('overview-api'); // Loads services/overview-api/.env
 *   validateConfig(); // Throws if misconfigured
 */

const path = require('path');
const fs = require('fs');

/**
 * Load environment variables for a specific service
 *
 * @param {string} serviceName - Name of the service (e.g., 'overview-api', 'api', 'recon-api')
 * @param {object} options - Loading options
 * @returns {object} - Configuration object
 */
function loadEnv(serviceName, options = {}) {
  const {
    required = true,
    fallbackToShared = true,
    override = false
  } = options;

  // Determine service directory path
  // Works whether called from service directory or project root
  const serviceDir = path.join(__dirname, '..', serviceName);
  const envPath = path.join(serviceDir, '.env');

  // Check if service .env exists
  const envExists = fs.existsSync(envPath);

  if (!envExists && required) {
    console.error(`❌ FATAL: .env file not found at: ${envPath}`);
    console.error(`   Service: ${serviceName}`);
    console.error(`   Current directory: ${process.cwd()}`);
    console.error(`   This service requires an .env file to run.`);
    console.error(`   Copy from .env.example if needed.`);
    process.exit(1);
  }

  if (!envExists && !required) {
    console.warn(`⚠️  WARNING: .env file not found at: ${envPath}`);
    console.warn(`   Service will use environment variables or defaults.`);
  }

  // Load service-specific .env
  if (envExists) {
    const result = require('dotenv').config({
      path: envPath,
      override: override
    });

    if (result.error) {
      console.error(`❌ FATAL: Error loading .env from: ${envPath}`);
      console.error(`   Error: ${result.error.message}`);
      process.exit(1);
    }

    console.log(`✅ Loaded environment from: ${envPath}`);
    console.log(`   Variables loaded: ${Object.keys(result.parsed || {}).length}`);
  }

  // Optionally load shared config (overview-api/.env) for shared secrets
  if (fallbackToShared && serviceName !== 'overview-api') {
    const sharedEnvPath = path.join(__dirname, '..', 'overview-api', '.env');
    if (fs.existsSync(sharedEnvPath)) {
      // Load shared config WITHOUT override (so service-specific takes precedence)
      require('dotenv').config({
        path: sharedEnvPath,
        override: false
      });
      console.log(`✅ Loaded shared config from: ${sharedEnvPath}`);
    }
  }

  return buildConfig();
}

/**
 * Build configuration object from environment variables
 */
function buildConfig() {
  return {
    db: {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'settlepaisa_v2',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    sabpaisaDb: {
      user: process.env.SABPAISA_DB_USER || 'settlepaisainternal',
      host: process.env.SABPAISA_DB_HOST || '3.108.237.99',
      database: process.env.SABPAISA_DB_NAME || 'sabpaisa_prod',
      password: process.env.SABPAISA_DB_PASSWORD || '',
      port: parseInt(process.env.SABPAISA_DB_PORT || '5432'),
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      sessionSecret: process.env.SESSION_SECRET || 'session-secret-change-in-production',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
      refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    },
    app: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000'),
      logLevel: process.env.LOG_LEVEL || 'info',
      serviceName: process.env.SERVICE_NAME || 'unknown',
    },
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    },
    interService: {
      pgApiUrl: process.env.PG_API_URL || null,
      bankApiUrl: process.env.BANK_API_URL || null,
    },
    sftp: process.env.SFTP_HOST ? {
      host: process.env.SFTP_HOST,
      port: parseInt(process.env.SFTP_PORT || '22'),
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
      inboundDir: process.env.SFTP_INBOUND_DIR || '/inbound',
    } : null,
  };
}

/**
 * Validate configuration is suitable for current environment
 *
 * Checks:
 * - Production/staging must not use localhost database
 * - JWT_SECRET must be strong in production
 * - Required environment variables are set
 *
 * @param {object} config - Configuration object from buildConfig()
 * @throws {Error} - If configuration is invalid
 */
function validateConfig(config = buildConfig()) {
  const errors = [];
  const warnings = [];
  const nodeEnv = config.app.nodeEnv;

  // 1. Database configuration validation
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    if (config.db.host === 'localhost' || config.db.host === '127.0.0.1') {
      errors.push({
        severity: 'FATAL',
        message: `Database host is ${config.db.host} in ${nodeEnv} environment!`,
        fix: 'Set DB_HOST to your RDS endpoint in .env file',
        example: 'DB_HOST=your-db.region.rds.amazonaws.com'
      });
    }

    if (!config.db.password || config.db.password.length < 8) {
      errors.push({
        severity: 'FATAL',
        message: 'Database password is missing or too weak',
        fix: 'Set DB_PASSWORD in .env file',
        example: 'DB_PASSWORD=your-strong-password'
      });
    }
  }

  // 2. JWT Secret validation
  const jwtSecret = config.auth.jwtSecret;
  const minJwtLength = nodeEnv === 'production' ? 64 : 32;

  if (jwtSecret === 'your-secret-key-change-this-in-production') {
    errors.push({
      severity: 'FATAL',
      message: 'JWT_SECRET is using default value!',
      fix: 'Generate a strong secret and set JWT_SECRET in .env',
      example: 'JWT_SECRET=$(openssl rand -base64 64)'
    });
  }

  if (jwtSecret.length < minJwtLength) {
    const errorObj = {
      severity: nodeEnv === 'production' ? 'FATAL' : 'WARNING',
      message: `JWT_SECRET is too weak (${jwtSecret.length} chars, need ${minJwtLength}+)`,
      fix: 'Generate a stronger secret',
      example: 'JWT_SECRET=$(openssl rand -base64 64)'
    };

    if (nodeEnv === 'production') {
      errors.push(errorObj);
    } else {
      warnings.push(errorObj);
    }
  }

  // 3. CORS validation for production
  if (nodeEnv === 'production' && config.cors.origin === '*') {
    warnings.push({
      severity: 'WARNING',
      message: 'CORS is allowing all origins in production',
      fix: 'Set CORS_ORIGIN to your frontend domain',
      example: 'CORS_ORIGIN=https://your-domain.com'
    });
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  CONFIGURATION WARNINGS:');
    warnings.forEach((warn, i) => {
      console.warn(`\n${i + 1}. ${warn.message}`);
      console.warn(`   Fix: ${warn.fix}`);
      if (warn.example) console.warn(`   Example: ${warn.example}`);
    });
    console.warn('');
  }

  // Print errors and exit if any
  if (errors.length > 0) {
    console.error('\n❌ CONFIGURATION ERRORS - SERVICE CANNOT START:\n');
    errors.forEach((error, i) => {
      console.error(`${i + 1}. [${error.severity}] ${error.message}`);
      console.error(`   Fix: ${error.fix}`);
      if (error.example) console.error(`   Example: ${error.example}`);
      console.error('');
    });

    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Please fix the above errors and restart the service.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(1);
  }

  // Success message
  console.log('✅ Configuration validation passed');
  console.log(`   Environment: ${nodeEnv}`);
  console.log(`   Database: ${config.db.host}:${config.db.port}/${config.db.database}`);
  console.log(`   JWT Secret: ${jwtSecret.length} characters (strong: ${jwtSecret.length >= 64 ? 'yes' : 'no'})`);
  console.log('');

  return true;
}

/**
 * Get safe configuration summary for logging (hides secrets)
 */
function getConfigSummary(config = buildConfig()) {
  return {
    environment: config.app.nodeEnv,
    service: config.app.serviceName,
    database: {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
    },
    auth: {
      jwtSecretLength: config.auth.jwtSecret.length,
      jwtSecretStrong: config.auth.jwtSecret.length >= 64,
    },
    cors: {
      origin: config.cors.origin,
    }
  };
}

/**
 * Initialize environment for a service
 *
 * This is the main function services should call.
 * It loads env, validates config, and returns configuration.
 *
 * @param {string} serviceName - Name of the service
 * @param {object} options - Options for loading and validation
 * @returns {object} - Validated configuration
 */
function initEnv(serviceName, options = {}) {
  const {
    skipValidation = false,
    ...loadOptions
  } = options;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Initializing environment for: ${serviceName}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Load environment
  loadEnv(serviceName, loadOptions);

  // Build configuration
  const config = buildConfig();

  // Validate unless skipped
  if (!skipValidation) {
    validateConfig(config);
  }

  // Log summary
  console.log('Configuration summary:');
  console.log(JSON.stringify(getConfigSummary(config), null, 2));
  console.log('');

  return config;
}

module.exports = {
  loadEnv,
  buildConfig,
  validateConfig,
  getConfigSummary,
  initEnv,
};
