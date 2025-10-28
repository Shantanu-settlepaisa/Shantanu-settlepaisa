/**
 * Enhanced Health Check Module
 *
 * Provides comprehensive health check endpoints for all services
 *
 * Features:
 * - Database connectivity verification
 * - Configuration validation display
 * - Shows actual DB host (critical for detecting localhost vs RDS)
 * - Shows JWT secret strength
 * - Startup time and uptime
 * - Memory usage
 *
 * Usage:
 *   const { createHealthCheckEndpoint } = require('../shared/health-check.cjs');
 *   const config = require('../config/env.cjs');
 *
 *   createHealthCheckEndpoint(app, 'my-service', config, pool);
 *
 * This creates GET /health endpoint
 */

/**
 * Create a comprehensive health check endpoint
 *
 * @param {object} app - Express app instance
 * @param {string} serviceName - Name of the service
 * @param {object} config - Configuration object
 * @param {object} pool - PostgreSQL pool (optional)
 */
function createHealthCheckEndpoint(app, serviceName, config, pool = null) {
  const startTime = Date.now();

  app.get('/health', async (req, res) => {
    const health = {
      service: serviceName,
      status: 'unknown',
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - startTime) / 1000,
    };

    // Add configuration info
    health.config = {
      environment: config.app.nodeEnv,
      port: config.app.port,
      database: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        // Don't expose username/password
      },
      auth: {
        jwtSecretLength: config.auth.jwtSecret ? config.auth.jwtSecret.length : 0,
        jwtSecretStrong: config.auth.jwtSecret ? config.auth.jwtSecret.length >= 64 : false,
      },
    };

    // Validate configuration
    health.configValidation = validateHealthConfig(config);

    // Test database connectivity if pool provided
    if (pool) {
      try {
        const result = await pool.query('SELECT NOW()');
        health.database = 'connected';
        health.databaseTimestamp = result.rows[0].now;
        health.status = 'healthy';
      } catch (error) {
        health.database = 'disconnected';
        health.databaseError = error.message;
        health.status = 'unhealthy';
      }
    } else {
      health.database = 'no_pool_provided';
      health.status = 'healthy';
    }

    // Add memory usage
    const memUsage = process.memoryUsage();
    health.memory = {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    };

    // Set HTTP status based on health
    const httpStatus = health.status === 'healthy' ? 200 : 503;

    res.status(httpStatus).json(health);
  });

  console.log(`✅ Health check endpoint registered at GET /health`);
}

/**
 * Validate configuration for health check
 * Returns warnings and errors without stopping the service
 */
function validateHealthConfig(config) {
  const issues = [];
  const nodeEnv = config.app.nodeEnv;

  // Check database host
  if ((nodeEnv === 'production' || nodeEnv === 'staging') &&
      (config.db.host === 'localhost' || config.db.host === '127.0.0.1')) {
    issues.push({
      severity: 'CRITICAL',
      component: 'database',
      message: `Database host is ${config.db.host} in ${nodeEnv} environment`,
      recommendation: 'Configure DB_HOST to point to RDS endpoint',
    });
  }

  // Check JWT secret
  if (config.auth.jwtSecret === 'your-secret-key-change-this-in-production') {
    issues.push({
      severity: 'CRITICAL',
      component: 'auth',
      message: 'JWT_SECRET is using default value',
      recommendation: 'Set a strong JWT_SECRET in environment',
    });
  }

  if (config.auth.jwtSecret && config.auth.jwtSecret.length < 64) {
    issues.push({
      severity: nodeEnv === 'production' ? 'CRITICAL' : 'WARNING',
      component: 'auth',
      message: `JWT_SECRET is weak (${config.auth.jwtSecret.length} chars, need 64+)`,
      recommendation: 'Generate stronger secret with: openssl rand -base64 64',
    });
  }

  // Check CORS in production
  if (nodeEnv === 'production' && config.cors && config.cors.origin === '*') {
    issues.push({
      severity: 'WARNING',
      component: 'cors',
      message: 'CORS is allowing all origins in production',
      recommendation: 'Set CORS_ORIGIN to specific domain',
    });
  }

  return {
    isValid: issues.filter(i => i.severity === 'CRITICAL').length === 0,
    issues: issues,
  };
}

/**
 * Create a simple liveness probe endpoint
 * Just returns 200 OK if service is running
 */
function createLivenessProbe(app) {
  app.get('/livez', (req, res) => {
    res.status(200).send('OK');
  });
  console.log(`✅ Liveness probe registered at GET /livez`);
}

/**
 * Create a readiness probe endpoint
 * Returns 200 only if service is ready to handle requests
 */
function createReadinessProbe(app, pool = null) {
  app.get('/readyz', async (req, res) => {
    // If pool provided, check database connectivity
    if (pool) {
      try {
        await pool.query('SELECT 1');
        res.status(200).send('READY');
      } catch (error) {
        res.status(503).send('NOT READY: Database unavailable');
      }
    } else {
      res.status(200).send('READY');
    }
  });
  console.log(`✅ Readiness probe registered at GET /readyz`);
}

/**
 * Register all health check endpoints at once
 */
function registerHealthChecks(app, serviceName, config, pool = null) {
  createHealthCheckEndpoint(app, serviceName, config, pool);
  createLivenessProbe(app);
  createReadinessProbe(app, pool);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Health check endpoints ready for ${serviceName}:`);
  console.log('  GET /health  - Full health check with config validation');
  console.log('  GET /livez   - Liveness probe (K8s compatible)');
  console.log('  GET /readyz  - Readiness probe (K8s compatible)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

module.exports = {
  createHealthCheckEndpoint,
  createLivenessProbe,
  createReadinessProbe,
  registerHealthChecks,
  validateHealthConfig,
};
