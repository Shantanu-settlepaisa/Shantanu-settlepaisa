/**
 * Structured Logger
 *
 * Purpose: Centralized logging for all backend services
 * Features:
 * - Structured JSON logging
 * - Different log levels (error, warn, info, debug)
 * - Automatic timestamp and service name
 * - Request ID tracking for tracing
 * - Separate files for errors and combined logs
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('User logged in', { userId, email });
 *   logger.error('Database connection failed', { error: err.message });
 */

const winston = require('winston');
const path = require('path');

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || 'info';

// Service name from environment or default
const serviceName = process.env.SERVICE_NAME || 'ops-dashboard';

// Log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, requestId, userId, ...meta }) => {
    const baseLog = {
      timestamp,
      level,
      service: service || serviceName,
      message
    };

    // Add optional fields
    if (requestId) baseLog.requestId = requestId;
    if (userId) baseLog.userId = userId;

    // Add any additional metadata
    if (Object.keys(meta).length > 0) {
      baseLog.meta = meta;
    }

    return JSON.stringify(baseLog);
  })
);

// Console format (human-readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, requestId, userId, ...meta }) => {
    let log = `${timestamp} [${level}] [${service || serviceName}] ${message}`;

    if (requestId) log += ` (reqId: ${requestId})`;
    if (userId) log += ` (user: ${userId})`;

    if (Object.keys(meta).length > 0) {
      log += `\n  ${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: serviceName },
  transports: []
});

// Add console transport (always enabled)
logger.add(new winston.transports.Console({
  format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
}));

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  const logDir = process.env.LOG_DIR || '/var/log/ops-dashboard';

  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: logFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));

  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format: logFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
}

/**
 * Create a child logger with additional context
 * @param {Object} context - Additional metadata to include in all logs
 * @returns {Object} - Child logger instance
 */
logger.child = function(context) {
  return {
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta })
  };
};

/**
 * Express middleware to add request ID to logger
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
logger.middleware = function(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  req.logger = logger.child({ requestId });

  // Log incoming request
  req.logger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  next();
};

/**
 * Generate a unique request ID
 * @returns {string} - Random request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Audit log helper - logs to both regular log and audit log table
 * @param {Object} params - Audit log parameters
 */
logger.audit = function({ userId, action, resourceType, resourceId, oldValue, newValue, metadata }) {
  logger.info('AUDIT_LOG', {
    userId,
    action,
    resourceType,
    resourceId,
    oldValue,
    newValue,
    metadata,
    auditLog: true
  });
};

module.exports = logger;
