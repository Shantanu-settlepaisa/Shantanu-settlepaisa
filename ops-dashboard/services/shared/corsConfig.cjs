/**
 * Hardened CORS Configuration
 * Only allows requests from approved domains
 *
 * Security: Prevents unauthorized websites from making requests to our API
 */

const allowedOrigins = [
  // Production
  'https://settlepaisaops.sabpaisa.in',
  'https://ops.settlepaisa.com',
  'https://settlepaisaopsapi.sabpaisa.in',

  // Staging
  'http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com',
  'http://52.66.199.215:5174', // Staging EC2

  // Local development
  'http://localhost:5174',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      console.warn(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],

  // Exposed headers (accessible to frontend)
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Per-Page'
  ],

  // Preflight cache duration (24 hours)
  maxAge: 86400,

  // Allow preflight to succeed
  optionsSuccessStatus: 204
};

/**
 * Development-only CORS (wide open)
 * Use only in local development, never in production!
 */
const devCorsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

/**
 * Get CORS options based on environment
 */
function getCorsOptions() {
  const isDevelopment = process.env.NODE_ENV === 'development' ||
                        process.env.DB_HOST === 'localhost' ||
                        !process.env.DB_HOST?.includes('amazonaws.com');

  if (isDevelopment) {
    console.log('[CORS] Using development CORS (allows all origins)');
    return devCorsOptions;
  }

  console.log('[CORS] Using production CORS (whitelist only)');
  return corsOptions;
}

module.exports = getCorsOptions();
module.exports.corsOptions = corsOptions;
module.exports.devCorsOptions = devCorsOptions;
module.exports.getCorsOptions = getCorsOptions;
