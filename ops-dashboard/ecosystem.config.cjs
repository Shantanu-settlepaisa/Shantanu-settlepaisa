/**
 * PM2 Ecosystem Configuration for SettlePaisa Ops Dashboard
 *
 * This file defines how all services should be started and managed by PM2.
 *
 * Benefits:
 * - Consistent service startup across environments
 * - Proper working directories ensure .env files load correctly
 * - Auto-restart policies for resilience
 * - Centralized log management
 * - Easy deployment: `pm2 start ecosystem.config.js`
 * - Works perfectly with `pm2 save` and `pm2 resurrect`
 *
 * Usage:
 *   # Start all services
 *   pm2 start ecosystem.config.js
 *
 *   # Start specific service
 *   pm2 start ecosystem.config.js --only overview-api
 *
 *   # Stop all
 *   pm2 stop ecosystem.config.js
 *
 *   # Restart all
 *   pm2 restart ecosystem.config.js
 *
 *   # Save configuration
 *   pm2 save
 *
 *   # Restore after reboot
 *   pm2 resurrect
 */

module.exports = {
  apps: [
    /**
     * Overview API - Main dashboard and authentication API
     * Port: 5108
     * Entry: index.js (includes auth endpoints)
     */
    {
      name: 'overview-api',
      script: './index.js',
      cwd: './services/overview-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5108,
        SERVICE_NAME: 'overview-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5108,
        SERVICE_NAME: 'overview-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5108,
        SERVICE_NAME: 'overview-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      // Auto restart on file changes (development only)
      watch: false,
      // Logging
      error_file: './logs/overview-api-error.log',
      out_file: './logs/overview-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Upload API - File upload and processing service
     * Port: 5107
     * Entry: file-upload-v2.cjs
     */
    {
      name: 'upload-api',
      script: './file-upload-v2.cjs',
      cwd: './services/api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5107,
        SERVICE_NAME: 'upload-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5107,
        SERVICE_NAME: 'upload-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5107,
        SERVICE_NAME: 'upload-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/upload-api-error.log',
      out_file: './logs/upload-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Reconciliation API - Reconciliation engine
     * Port: 5103
     * Entry: index.js
     */
    {
      name: 'recon-api',
      script: './index.js',
      cwd: './services/recon-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5103,
        SERVICE_NAME: 'recon-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5103,
        SERVICE_NAME: 'recon-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5103,
        SERVICE_NAME: 'recon-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/recon-api-error.log',
      out_file: './logs/recon-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Settlement API - Settlement processing
     * Port: 5110
     * Entry: settlement-api.cjs
     */
    {
      name: 'settlement-api',
      script: './settlement-api.cjs',
      cwd: './services/settlement-engine',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5110,
        SERVICE_NAME: 'settlement-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5110,
        SERVICE_NAME: 'settlement-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5110,
        SERVICE_NAME: 'settlement-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/settlement-api-error.log',
      out_file: './logs/settlement-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Settlement Queue Processor - Background job processor
     * Entry: settlement-queue-processor.cjs
     */
    {
      name: 'settlement-queue-processor',
      script: './settlement-queue-processor.cjs',
      cwd: './services/settlement-engine',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'settlement-queue-processor',
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'settlement-queue-processor',
      },
      env_staging: {
        NODE_ENV: 'staging',
        SERVICE_NAME: 'settlement-queue-processor',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/settlement-queue-error.log',
      out_file: './logs/settlement-queue-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * PG Ingestion - Payment gateway webhook receiver
     * Port: 5111
     * Entry: pg-ingestion-server.cjs
     */
    {
      name: 'pg-ingestion',
      script: './pg-ingestion-server.cjs',
      cwd: './services/pg-ingestion',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5111,
        SERVICE_NAME: 'pg-ingestion',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5111,
        SERVICE_NAME: 'pg-ingestion',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5111,
        SERVICE_NAME: 'pg-ingestion',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/pg-ingestion-error.log',
      out_file: './logs/pg-ingestion-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Chargeback API - Chargeback and refund management
     * Port: 5112
     * Entry: index.js
     */
    {
      name: 'chargeback-api',
      script: './index.js',
      cwd: './services/chargeback-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5112,
        SERVICE_NAME: 'chargeback-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5112,
        SERVICE_NAME: 'chargeback-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5112,
        SERVICE_NAME: 'chargeback-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/chargeback-api-error.log',
      out_file: './logs/chargeback-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Exports API - Report exports and file generation
     * Port: 5113
     * Entry: server.cjs
     */
    {
      name: 'exports-api',
      script: './server.cjs',
      cwd: './services/exports-api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5113,
        SERVICE_NAME: 'exports-api',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5113,
        SERVICE_NAME: 'exports-api',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5113,
        SERVICE_NAME: 'exports-api',
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      watch: false,
      // Logging
      error_file: './logs/exports-api-error.log',
      out_file: './logs/exports-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    /**
     * Batch Processor Worker - Background job processor for uploads/recon
     * Entry: batch-processor.cjs
     *
     * This worker polls the sp_v2_job_queue table and processes jobs in batches.
     * Features:
     * - Processes large file uploads without timeout
     * - Saves checkpoints for resume on crash
     * - Supports multiple job types (UPLOAD_PG, UPLOAD_BANK, RECONCILIATION)
     */
    {
      name: 'batch-processor',
      script: './batch-processor.cjs',
      cwd: './services/workers',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        SERVICE_NAME: 'batch-processor',
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'batch-processor',
      },
      env_staging: {
        NODE_ENV: 'staging',
        SERVICE_NAME: 'batch-processor',
      },
      // Restart policy - be more lenient with worker
      max_restarts: 20,
      min_uptime: '30s',
      restart_delay: 5000,
      watch: false,
      // Worker-specific: longer kill timeout for graceful shutdown
      kill_timeout: 60000,  // 60 seconds to finish current batch
      // Logging
      error_file: './logs/batch-processor-error.log',
      out_file: './logs/batch-processor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],

  /**
   * Deployment configuration for PM2 deploy
   * (Optional - for automated deployments)
   */
  deploy: {
    production: {
      user: 'ec2-user',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ops-dashboard.git',
      path: '/home/ec2-user/ops-dashboard',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production && pm2 save',
    },
    staging: {
      user: 'ec2-user',
      host: '52.66.199.215',
      ref: 'origin/feat/ops-dashboard-exports',
      repo: 'git@github.com:your-org/ops-dashboard.git',
      path: '/home/ec2-user/ops-dashboard',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging && pm2 save',
    },
  },
};
