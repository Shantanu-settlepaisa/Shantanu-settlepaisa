/**
 * Centralized environment configuration with validation
 * Used by all backend services
 *
 * NOTE: This now uses the shared env-loader for consistent, validated loading
 */
const path = require('path');

// Use shared environment loader for robust loading and validation
const { initEnv } = require('../shared/env-loader.cjs');

// Initialize environment with overview-api as the primary config source
// This loads overview-api/.env and validates all configuration
const config = initEnv('overview-api', {
  skipValidation: false, // Always validate
});

// Export config for backward compatibility
module.exports = config;
