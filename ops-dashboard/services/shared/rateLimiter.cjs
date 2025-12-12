/**
 * Rate Limiting Configuration
 * Protects against brute force attacks and DDoS
 *
 * Rate limiters:
 * - apiLimiter: General API protection (100 req/15min)
 * - authLimiter: Login/registration protection (5 req/15min)
 * - uploadLimiter: File upload protection (10 req/hour)
 * - strictLimiter: Critical endpoints (3 req/hour)
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 * Applies to most API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation

  // Custom key generator (use IP + user ID if authenticated)
  keyGenerator: (req) => {
    return req.user ? `${req.ip}_${req.user.id}` : req.ip;
  },

  // Skip successful requests (only count failures)
  skip: (req, res) => res.statusCode < 400,

  // Handler for when limit is exceeded
  handler: (req, res) => {
    console.warn(`[RATE LIMIT] IP ${req.ip} exceeded general API limit`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 failed attempts per 15 minutes per IP
 * Protects login, registration, password reset
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true, // Only count failed requests
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation

  handler: (req, res) => {
    console.warn(`[AUTH RATE LIMIT] IP ${req.ip} exceeded auth limit (${req.body?.email || 'unknown'})`);
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Account temporarily locked for 15 minutes.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Upload rate limiter
 * 100 uploads per hour per IP/user (increased for large file operations)
 * Protects file upload endpoints
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased from 10 to 100 for production file processing
  message: {
    success: false,
    error: 'Upload limit exceeded. Please try again after 1 hour.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation

  keyGenerator: (req) => {
    return req.user ? `upload_${req.user.id}` : `upload_${req.ip}`;
  },

  handler: (req, res) => {
    console.warn(`[UPLOAD RATE LIMIT] ${req.user?.email || req.ip} exceeded upload limit`);
    res.status(429).json({
      success: false,
      error: 'You have exceeded the upload limit. Please try again later.',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Strict limiter for critical operations
 * 3 requests per hour per IP/user
 * For settlement approvals, financial operations
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Critical operation rate limit exceeded.',
    code: 'CRITICAL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation

  keyGenerator: (req) => {
    return req.user ? `critical_${req.user.id}` : `critical_${req.ip}`;
  },

  handler: (req, res) => {
    console.error(`[CRITICAL RATE LIMIT] ${req.user?.email || req.ip} exceeded critical operation limit`);
    res.status(429).json({
      success: false,
      error: 'Critical operation rate limit exceeded. Please contact support if you need to perform more operations.',
      code: 'CRITICAL_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

/**
 * Development rate limiter (very lenient)
 * 1000 requests per minute
 * Use only in development!
 */
const devLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  message: {
    success: false,
    error: 'Even in development, you hit the rate limit!',
    code: 'DEV_RATE_LIMIT'
  }
});

/**
 * Get appropriate rate limiter based on environment
 */
function getApiLimiter() {
  const isDevelopment = process.env.NODE_ENV === 'development' ||
                        process.env.DB_HOST === 'localhost' ||
                        !process.env.DB_HOST?.includes('amazonaws.com');

  if (isDevelopment) {
    console.log('[RATE LIMIT] Using development rate limiter (lenient)');
    return devLimiter;
  }

  console.log('[RATE LIMIT] Using production rate limiter (strict)');
  return apiLimiter;
}

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  strictLimiter,
  devLimiter,
  getApiLimiter
};
