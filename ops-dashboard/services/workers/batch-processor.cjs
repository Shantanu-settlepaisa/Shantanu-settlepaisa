/**
 * Batch Processor Worker
 *
 * A standalone PM2 process that polls the job queue and processes jobs in batches.
 * This runs independently of the API servers.
 *
 * Features:
 * - Polls for queued jobs every 5 seconds
 * - Processes jobs in configurable batch sizes
 * - Saves checkpoints after each batch (resume on crash)
 * - Handles graceful shutdown (SIGTERM/SIGINT)
 * - Auto-recovers stale job locks
 *
 * Start with PM2:
 *   pm2 start services/workers/batch-processor.cjs --name batch-processor
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const os = require('os');
const jobQueue = require('../shared/job-queue.cjs');

// Worker configuration
const WORKER_CONFIG = {
  pollIntervalMs: 5000,           // Check for new jobs every 5 seconds
  staleLockCheckIntervalMs: 60000, // Check for stale locks every minute
  staleLockThresholdMinutes: 30,   // Consider jobs stale after 30 minutes
  maxConcurrentJobs: 1,            // Process one job at a time (can increase later)
  gracefulShutdownTimeoutMs: 30000 // Wait 30s for current job to finish on shutdown
};

// Generate unique worker ID
const WORKER_ID = `worker-${os.hostname()}-${process.pid}`;

// Database configuration
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  max: 5,  // Smaller pool for worker
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
};

// Add SSL for production
if (dbConfig.host && !dbConfig.host.includes('localhost')) {
  dbConfig.ssl = { rejectUnauthorized: false };
}

// Create database pool
const pool = new Pool(dbConfig);

// Job handlers registry
const handlers = {};

// State
let isShuttingDown = false;
let currentJob = null;
let pollTimer = null;
let staleLockTimer = null;

/**
 * Register a job handler
 *
 * @param {string} jobType - Job type (e.g., 'UPLOAD_PG')
 * @param {Function} handler - Async function(job, context) that processes the job
 */
function registerHandler(jobType, handler) {
  handlers[jobType] = handler;
  console.log(`[BatchProcessor] Registered handler for ${jobType}`);
}

/**
 * Process a single batch of records
 *
 * @param {Object} job - Job from queue
 * @param {Object} context - Processing context (pool, handlers, etc.)
 * @returns {Object} Batch result
 */
async function processBatch(job, context) {
  const handler = handlers[job.jobType];
  if (!handler) {
    throw new Error(`No handler registered for job type: ${job.jobType}`);
  }

  const config = job.config;
  const batchSize = config.batchSize || 5000;
  const startRecord = job.processedRecords || 0;
  const endRecord = Math.min(startRecord + batchSize, job.totalRecords || Infinity);
  const batchNumber = (job.currentBatch || 0) + 1;

  console.log(`[BatchProcessor] Processing batch ${batchNumber}: records ${startRecord + 1} to ${endRecord}`);

  // Log batch start
  await jobQueue.addJobLog(job.jobId, jobQueue.LOG_TYPE.BATCH_START,
    `Starting batch ${batchNumber}`, { startRecord, endRecord, batchSize }, batchNumber);

  const batchStartTime = Date.now();

  // Call the handler
  const result = await handler(job, {
    pool: context.pool,
    startRecord,
    endRecord,
    batchNumber,
    batchSize,
    workerId: WORKER_ID
  });

  const batchDurationMs = Date.now() - batchStartTime;

  // Log batch completion
  await jobQueue.addJobLog(job.jobId, jobQueue.LOG_TYPE.BATCH_COMPLETE,
    `Completed batch ${batchNumber} in ${batchDurationMs}ms`, {
      ...result,
      durationMs: batchDurationMs
    }, batchNumber);

  return {
    batchNumber,
    processed: result.processed || 0,
    failed: result.failed || 0,
    skipped: result.skipped || 0,
    durationMs: batchDurationMs
  };
}

/**
 * Process a job (all batches)
 *
 * @param {Object} job - Job from queue
 */
async function processJob(job) {
  console.log(`[BatchProcessor] Starting job ${job.jobId} (${job.jobType})`);
  console.log(`[BatchProcessor] Config:`, job.config);

  const config = job.config;
  let totalProcessed = job.processedRecords || 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let currentBatch = job.currentBatch || 0;

  try {
    // If resuming, log it
    if (job.processedRecords > 0) {
      console.log(`[BatchProcessor] Resuming from batch ${currentBatch}, record ${totalProcessed}`);
      await jobQueue.addJobLog(job.jobId, jobQueue.LOG_TYPE.RESUME,
        `Resuming job from batch ${currentBatch}`, {
          processedSoFar: totalProcessed,
          totalRecords: job.totalRecords
        });
    }

    // Process batches until done
    while (totalProcessed < job.totalRecords && !isShuttingDown) {
      const batchResult = await processBatch(job, { pool });

      totalProcessed += batchResult.processed;
      totalFailed += batchResult.failed;
      totalSkipped += batchResult.skipped;
      currentBatch = batchResult.batchNumber;

      // Update progress in database
      await jobQueue.updateProgress(job.jobId, {
        processedRecords: totalProcessed,
        failedRecords: totalFailed,
        skippedRecords: totalSkipped,
        currentBatch: currentBatch,
        checkpoint: {
          lastProcessedRecord: totalProcessed,
          lastBatchNumber: currentBatch,
          batchResult
        }
      });

      // Update job object for next iteration
      job.processedRecords = totalProcessed;
      job.currentBatch = currentBatch;

      // Delay between batches (if configured)
      const batchDelay = config.batchDelayMs || 0;
      if (batchDelay > 0 && totalProcessed < job.totalRecords) {
        console.log(`[BatchProcessor] Waiting ${batchDelay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }

      // Check if shutting down
      if (isShuttingDown) {
        console.log(`[BatchProcessor] Graceful shutdown - saving progress and exiting`);
        break;
      }
    }

    // If we processed everything, complete the job
    if (totalProcessed >= job.totalRecords) {
      await jobQueue.completeJob(job.jobId, {
        totalProcessed,
        totalFailed,
        totalSkipped,
        totalBatches: currentBatch,
        completedAt: new Date().toISOString()
      });

      console.log(`[BatchProcessor] Job ${job.jobId} COMPLETED: ${totalProcessed} processed, ${totalFailed} failed, ${totalSkipped} skipped`);
    } else if (isShuttingDown) {
      // Job interrupted by shutdown - leave in PROCESSING state for another worker to resume
      console.log(`[BatchProcessor] Job ${job.jobId} interrupted by shutdown - will be resumed`);
    }

  } catch (error) {
    console.error(`[BatchProcessor] Job ${job.jobId} ERROR:`, error.message);

    // Check if we should retry
    const retryResult = await jobQueue.retryJob(job.jobId, error.message, config.retryDelayMs || 5000);

    if (!retryResult.retried) {
      console.error(`[BatchProcessor] Job ${job.jobId} FAILED permanently: ${error.message}`);
      await jobQueue.failJob(job.jobId, error.message, {
        stack: error.stack,
        processedBeforeError: totalProcessed,
        batchAtError: currentBatch
      });
    } else {
      console.log(`[BatchProcessor] Job ${job.jobId} will retry (attempt ${retryResult.retryCount})`);
    }
  }
}

/**
 * Main polling loop
 */
async function pollForJobs() {
  if (isShuttingDown) return;

  try {
    // Try to acquire a job
    const job = await jobQueue.acquireJob(WORKER_ID);

    if (job) {
      currentJob = job;
      await processJob(job);
      currentJob = null;
    }
  } catch (error) {
    console.error(`[BatchProcessor] Poll error:`, error.message);
  }

  // Schedule next poll
  if (!isShuttingDown) {
    pollTimer = setTimeout(pollForJobs, WORKER_CONFIG.pollIntervalMs);
  }
}

/**
 * Check for and release stale job locks
 */
async function checkStaleLocks() {
  if (isShuttingDown) return;

  try {
    const released = await jobQueue.releaseStaleJobLocks(WORKER_CONFIG.staleLockThresholdMinutes);
    if (released > 0) {
      console.log(`[BatchProcessor] Released ${released} stale job locks`);
    }
  } catch (error) {
    console.error(`[BatchProcessor] Error checking stale locks:`, error.message);
  }

  // Schedule next check
  if (!isShuttingDown) {
    staleLockTimer = setTimeout(checkStaleLocks, WORKER_CONFIG.staleLockCheckIntervalMs);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  console.log(`[BatchProcessor] Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Clear timers
  if (pollTimer) clearTimeout(pollTimer);
  if (staleLockTimer) clearTimeout(staleLockTimer);

  // Wait for current job to checkpoint (with timeout)
  if (currentJob) {
    console.log(`[BatchProcessor] Waiting for current job ${currentJob.jobId} to checkpoint...`);

    const shutdownTimeout = setTimeout(() => {
      console.warn(`[BatchProcessor] Shutdown timeout - forcing exit`);
      process.exit(1);
    }, WORKER_CONFIG.gracefulShutdownTimeoutMs);

    // The current job will save checkpoint on next batch iteration when it sees isShuttingDown=true
    // Just wait a bit for it to finish the current batch
    await new Promise(resolve => setTimeout(resolve, 5000));

    clearTimeout(shutdownTimeout);
  }

  // Close database pool
  await pool.end();
  console.log(`[BatchProcessor] Shutdown complete`);
  process.exit(0);
}

/**
 * Load job handlers from handlers directory
 */
async function loadHandlers() {
  const fs = require('fs');
  const path = require('path');

  const handlersDir = path.join(__dirname, 'handlers');

  if (!fs.existsSync(handlersDir)) {
    console.warn(`[BatchProcessor] Handlers directory not found: ${handlersDir}`);
    return;
  }

  const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.cjs') || f.endsWith('.js'));

  for (const file of files) {
    try {
      const handler = require(path.join(handlersDir, file));
      if (handler.jobType && handler.process) {
        registerHandler(handler.jobType, handler.process);
      } else {
        console.warn(`[BatchProcessor] Handler ${file} missing jobType or process function`);
      }
    } catch (error) {
      console.error(`[BatchProcessor] Failed to load handler ${file}:`, error.message);
    }
  }
}

/**
 * Start the worker
 */
async function start() {
  console.log('='.repeat(60));
  console.log(`[BatchProcessor] Starting worker ${WORKER_ID}`);
  console.log(`[BatchProcessor] Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`[BatchProcessor] Poll interval: ${WORKER_CONFIG.pollIntervalMs}ms`);
  console.log('='.repeat(60));

  // Test database connection
  try {
    const client = await pool.connect();
    console.log(`[BatchProcessor] Database connection successful`);
    client.release();
  } catch (error) {
    console.error(`[BatchProcessor] Database connection failed:`, error.message);
    process.exit(1);
  }

  // Initialize job queue
  jobQueue.init(pool);

  // Load handlers
  await loadHandlers();

  console.log(`[BatchProcessor] Registered handlers: ${Object.keys(handlers).join(', ') || 'none'}`);

  // Set up signal handlers for graceful shutdown
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start polling for jobs
  console.log(`[BatchProcessor] Starting job polling...`);
  pollForJobs();

  // Start stale lock checker
  checkStaleLocks();
}

// Start the worker
start().catch(error => {
  console.error(`[BatchProcessor] Fatal error:`, error);
  process.exit(1);
});
