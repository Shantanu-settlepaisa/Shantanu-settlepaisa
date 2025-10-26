/**
 * CORS Configuration
 * Restricts cross-origin requests to whitelisted origins only
 * Security Fix: HIGH-001 - Wide-Open CORS Policy
 */

const allowedOrigins = [
  'http://localhost:5174',                                                          // Local development
  'http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com',         // Staging 2
  'https://ops.settlepaisa.com'                                                    // Production
];

/**
 * CORS options with origin validation
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('[CORS] Blocked request from unauthorized origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,                                    // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'],    // Allowed request headers
  exposedHeaders: ['Content-Length', 'X-Request-Id'],   // Headers exposed to client
  maxAge: 86400                                         // Preflight cache duration (24 hours)
};

module.exports = { corsOptions, allowedOrigins };
