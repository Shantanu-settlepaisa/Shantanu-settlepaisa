/**
 * Job Queue Library
 *
 * Provides a persistent job queue system for batch processing.
 * Jobs are stored in PostgreSQL and survive server restarts.
 *
 * Features:
 * - Create jobs with configurable batch sizes
 * - Atomic job acquisition (no duplicate processing)
 * - Progress checkpointing (resume from failures)
 * - Priority-based scheduling
 * - Automatic stale lock recovery
 *
 * Usage:
 *   const jobQueue = require('./shared/job-queue.cjs');
 *   await jobQueue.init(pool);
 *
 *   // Create a job
 *   const job = await jobQueue.createJob({
 *     jobType: 'UPLOAD_PG',
 *     payloadPath: '/tmp/upload-123.csv',
 *     config: { batchSize: 5000 },
 *     createdBy: 'user@example.com'
 *   });
 *
 *   // Acquire next job (worker)
 *   const nextJob = await jobQueue.acquireJob('worker-1');
 *
 *   // Update progress
 *   await jobQueue.updateProgress(job.jobId, { processed: 5000, batch: 1 });
 *
 *   // Complete job
 *   await jobQueue.completeJob(job.jobId, { inserted: 10000, duplicates: 50 });
 */

const { v4: uuidv4 } = require('uuid');

// Default configuration for different job types
const DEFAULT_CONFIGS = {
  UPLOAD_PG: {
    batchSize: 5000,        // Records per batch
    batchDelayMs: 100,      // ms between batches (gentle on DB)
    maxRetries: 3,
    retryDelayMs: 5000,
    checkpointEveryBatch: 1, // Save progress every N batches
  },
  UPLOAD_BANK: {
    batchSize: 5000,
    batchDelayMs: 100,
    maxRetries: 3,
    retryDelayMs: 5000,
    checkpointEveryBatch: 1,
  },
  RECONCILIATION: {
    batchSize: 10000,
    batchDelayMs: 500,
    maxRetries: 3,
    retryDelayMs: 10000,
    checkpointEveryBatch: 1,
  },
  SETTLEMENT: {
    batchSize: 1000,
    batchDelayMs: 200,
    maxRetries: 5,
    retryDelayMs: 30000,
    checkpointEveryBatch: 1,
  },
  EXPORT: {
    batchSize: 10000,
    batchDelayMs: 50,
    maxRetries: 2,
    retryDelayMs: 5000,
    checkpointEveryBatch: 5,
  },
  CLEANUP: {
    batchSize: 1000,
    batchDelayMs: 100,
    maxRetries: 1,
    retryDelayMs: 0,
    checkpointEveryBatch: 10,
  }
};

// Job status constants
const JOB_STATUS = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED'
};

// Log type constants
const LOG_TYPE = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  BATCH_START: 'BATCH_START',
  BATCH_COMPLETE: 'BATCH_COMPLETE',
  CHECKPOINT: 'CHECKPOINT',
  RETRY: 'RETRY',
  RESUME: 'RESUME'
};

let pool = null;

/**
 * Initialize the job queue with a database pool
 */
function init(dbPool) {
  pool = dbPool;
  console.log('[JobQueue] Initialized with database pool');
}

/**
 * Get the database pool (throws if not initialized)
 */
function getPool() {
  if (!pool) {
    throw new Error('[JobQueue] Not initialized. Call init(pool) first.');
  }
  return pool;
}

/**
 * Create a new job in the queue
 *
 * @param {Object} options
 * @param {string} options.jobType - Type of job (UPLOAD_PG, UPLOAD_BANK, etc.)
 * @param {string} [options.jobName] - Human-readable name
 * @param {string} [options.payloadPath] - Path to input file
 * @param {Object} [options.payloadMetadata] - File metadata
 * @param {Object} [options.config] - Override default config
 * @param {number} [options.priority=5] - Priority (1=highest, 10=lowest)
 * @param {string} [options.createdBy] - User who created the job
 * @param {number} [options.totalRecords] - Total records if known
 * @param {Date} [options.scheduledFor] - When to run (default: now)
 * @returns {Object} Created job with jobId
 */
async function createJob(options) {
  const {
    jobType,
    jobName,
    payloadPath,
    payloadMetadata = {},
    config: userConfig = {},
    priority = 5,
    createdBy,
    totalRecords,
    scheduledFor
  } = options;

  // Validate job type
  if (!DEFAULT_CONFIGS[jobType]) {
    throw new Error(`[JobQueue] Invalid job type: ${jobType}. Valid types: ${Object.keys(DEFAULT_CONFIGS).join(', ')}`);
  }

  // Merge user config with defaults
  const config = {
    ...DEFAULT_CONFIGS[jobType],
    ...userConfig
  };

  // Calculate total batches if we know total records
  const totalBatches = totalRecords ? Math.ceil(totalRecords / config.batchSize) : null;

  const jobId = uuidv4();
  const nextRunAt = scheduledFor || new Date();

  const query = `
    INSERT INTO sp_v2_job_queue (
      job_id, job_type, job_name, config, payload_path, payload_metadata,
      priority, total_records, total_batches, created_by, next_run_at, max_retries
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;

  const values = [
    jobId,
    jobType,
    jobName || `${jobType} Job`,
    JSON.stringify(config),
    payloadPath,
    JSON.stringify(payloadMetadata),
    priority,
    totalRecords,
    totalBatches,
    createdBy,
    nextRunAt,
    config.maxRetries
  ];

  const result = await getPool().query(query, values);
  const job = result.rows[0];

  console.log(`[JobQueue] Created job ${jobId} (${jobType}) with priority ${priority}`);

  // Log job creation
  await addJobLog(jobId, LOG_TYPE.INFO, 'Job created', {
    jobType,
    config,
    payloadPath,
    totalRecords
  });

  return {
    jobId: job.job_id,
    jobType: job.job_type,
    status: job.status,
    config: job.config,
    priority: job.priority,
    createdAt: job.created_at
  };
}

/**
 * Acquire the next available job for processing
 * Uses row-level locking to prevent duplicate processing
 *
 * @param {string} workerId - Unique identifier for this worker
 * @param {string[]} [jobTypes] - Filter by job types (null = all)
 * @param {number} [maxPriority=10] - Only acquire jobs with priority <= this
 * @returns {Object|null} Job details or null if no jobs available
 */
async function acquireJob(workerId, jobTypes = null, maxPriority = 10) {
  const query = `SELECT * FROM acquire_next_job($1, $2, $3)`;
  const values = [workerId, jobTypes, maxPriority];

  const result = await getPool().query(query, values);

  if (result.rows.length === 0) {
    return null;
  }

  const job = result.rows[0];

  console.log(`[JobQueue] Worker ${workerId} acquired job ${job.job_id} (${job.job_type})`);

  // Log acquisition
  await addJobLog(job.job_id, LOG_TYPE.INFO, `Job acquired by worker ${workerId}`, {
    workerId,
    resumeFromBatch: job.current_batch,
    processedSoFar: job.processed_records
  });

  return {
    jobId: job.job_id,
    jobType: job.job_type,
    config: job.config,
    payloadPath: job.payload_path,
    payloadMetadata: job.payload_metadata,
    totalRecords: job.total_records,
    processedRecords: job.processed_records,
    currentBatch: job.current_batch,
    lastCheckpoint: job.last_checkpoint,
    retryCount: job.retry_count
  };
}

/**
 * Update job progress (call after each batch)
 *
 * @param {string} jobId - Job ID
 * @param {Object} progress
 * @param {number} progress.processedRecords - Total processed so far
 * @param {number} [progress.failedRecords] - Total failed so far
 * @param {number} [progress.skippedRecords] - Total skipped (duplicates)
 * @param {number} progress.currentBatch - Current batch number
 * @param {Object} [progress.checkpoint] - Checkpoint data for resume
 */
async function updateProgress(jobId, progress) {
  const {
    processedRecords,
    failedRecords = 0,
    skippedRecords = 0,
    currentBatch,
    checkpoint
  } = progress;

  const query = `
    UPDATE sp_v2_job_queue
    SET processed_records = $2,
        failed_records = $3,
        skipped_records = $4,
        current_batch = $5,
        last_checkpoint = COALESCE($6, last_checkpoint),
        locked_at = NOW()  -- Refresh lock
    WHERE job_id = $1
    RETURNING processed_records, total_records, current_batch, total_batches
  `;

  const values = [
    jobId,
    processedRecords,
    failedRecords,
    skippedRecords,
    currentBatch,
    checkpoint ? JSON.stringify(checkpoint) : null
  ];

  const result = await getPool().query(query, values);

  if (result.rows.length === 0) {
    throw new Error(`[JobQueue] Job ${jobId} not found`);
  }

  const row = result.rows[0];
  const progressPercent = row.total_records
    ? Math.round((row.processed_records / row.total_records) * 100)
    : null;

  console.log(`[JobQueue] Job ${jobId} progress: batch ${row.current_batch}/${row.total_batches || '?'}, ${row.processed_records}/${row.total_records || '?'} records (${progressPercent || '?'}%)`);

  return {
    processedRecords: row.processed_records,
    totalRecords: row.total_records,
    currentBatch: row.current_batch,
    totalBatches: row.total_batches,
    progressPercent
  };
}

/**
 * Save a checkpoint (for resume after crash)
 *
 * @param {string} jobId - Job ID
 * @param {number} batchNumber - Completed batch number
 * @param {Object} checkpointData - Data needed to resume
 */
async function saveCheckpoint(jobId, batchNumber, checkpointData) {
  const checkpoint = {
    batchNumber,
    savedAt: new Date().toISOString(),
    ...checkpointData
  };

  const query = `
    UPDATE sp_v2_job_queue
    SET last_checkpoint = $2,
        current_batch = $3
    WHERE job_id = $1
  `;

  await getPool().query(query, [jobId, JSON.stringify(checkpoint), batchNumber]);

  // Log checkpoint
  await addJobLog(jobId, LOG_TYPE.CHECKPOINT, `Checkpoint saved at batch ${batchNumber}`, checkpoint);

  console.log(`[JobQueue] Checkpoint saved for job ${jobId} at batch ${batchNumber}`);
}

/**
 * Complete a job successfully
 *
 * @param {string} jobId - Job ID
 * @param {Object} summary - Result summary
 */
async function completeJob(jobId, summary = {}) {
  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'COMPLETED',
        completed_at = NOW(),
        worker_id = NULL,
        locked_at = NULL,
        result_summary = $2
    WHERE job_id = $1
    RETURNING *
  `;

  const result = await getPool().query(query, [jobId, JSON.stringify(summary)]);

  if (result.rows.length === 0) {
    throw new Error(`[JobQueue] Job ${jobId} not found`);
  }

  const job = result.rows[0];
  const durationMs = job.completed_at - job.started_at;

  console.log(`[JobQueue] Job ${jobId} COMPLETED in ${Math.round(durationMs / 1000)}s`);

  // Log completion
  await addJobLog(jobId, LOG_TYPE.INFO, 'Job completed successfully', {
    ...summary,
    durationMs,
    processedRecords: job.processed_records,
    failedRecords: job.failed_records
  });

  return {
    jobId: job.job_id,
    status: job.status,
    processedRecords: job.processed_records,
    failedRecords: job.failed_records,
    durationMs
  };
}

/**
 * Fail a job (after max retries or fatal error)
 *
 * @param {string} jobId - Job ID
 * @param {string} errorMessage - Error message
 * @param {Object} [errorDetails] - Additional error context
 */
async function failJob(jobId, errorMessage, errorDetails = {}) {
  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'FAILED',
        completed_at = NOW(),
        worker_id = NULL,
        locked_at = NULL,
        last_error = $2,
        error_details = $3
    WHERE job_id = $1
    RETURNING *
  `;

  const result = await getPool().query(query, [
    jobId,
    errorMessage,
    JSON.stringify(errorDetails)
  ]);

  if (result.rows.length === 0) {
    throw new Error(`[JobQueue] Job ${jobId} not found`);
  }

  console.error(`[JobQueue] Job ${jobId} FAILED: ${errorMessage}`);

  // Log failure
  await addJobLog(jobId, LOG_TYPE.ERROR, `Job failed: ${errorMessage}`, errorDetails);

  return result.rows[0];
}

/**
 * Retry a failed job (puts it back in queue)
 *
 * @param {string} jobId - Job ID
 * @param {string} reason - Why retrying
 * @param {number} [delayMs=5000] - Delay before retry
 */
async function retryJob(jobId, reason, delayMs = 5000) {
  const nextRunAt = new Date(Date.now() + delayMs);

  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'QUEUED',
        worker_id = NULL,
        locked_at = NULL,
        retry_count = retry_count + 1,
        next_run_at = $2,
        last_error = $3
    WHERE job_id = $1
      AND retry_count < max_retries
    RETURNING job_id, retry_count, max_retries
  `;

  const result = await getPool().query(query, [jobId, nextRunAt, reason]);

  if (result.rows.length === 0) {
    // Either job not found or max retries exceeded
    const job = await getJobStatus(jobId);
    if (job && job.retryCount >= job.maxRetries) {
      await failJob(jobId, `Max retries (${job.maxRetries}) exceeded. Last error: ${reason}`);
      return { retried: false, reason: 'max_retries_exceeded' };
    }
    return { retried: false, reason: 'job_not_found' };
  }

  const row = result.rows[0];
  console.log(`[JobQueue] Job ${jobId} queued for retry (${row.retry_count}/${row.max_retries})`);

  // Log retry
  await addJobLog(jobId, LOG_TYPE.RETRY, `Retrying job (attempt ${row.retry_count})`, { reason, delayMs });

  return { retried: true, retryCount: row.retry_count };
}

/**
 * Get job status and details
 *
 * @param {string} jobId - Job ID
 * @returns {Object|null} Job details
 */
async function getJobStatus(jobId) {
  const query = `
    SELECT *,
           EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) * 1000 as duration_ms
    FROM sp_v2_job_queue
    WHERE job_id = $1
  `;

  const result = await getPool().query(query, [jobId]);

  if (result.rows.length === 0) {
    return null;
  }

  const job = result.rows[0];

  // Calculate progress percentage
  const progressPercent = job.total_records
    ? Math.round((job.processed_records / job.total_records) * 100)
    : null;

  // Estimate remaining time
  let estimatedRemainingMs = null;
  if (job.status === 'PROCESSING' && job.processed_records > 0 && job.total_records) {
    const elapsedMs = job.duration_ms;
    const recordsPerMs = job.processed_records / elapsedMs;
    const remainingRecords = job.total_records - job.processed_records;
    estimatedRemainingMs = Math.round(remainingRecords / recordsPerMs);
  }

  return {
    jobId: job.job_id,
    jobType: job.job_type,
    jobName: job.job_name,
    status: job.status,
    priority: job.priority,
    config: job.config,
    progress: {
      totalRecords: job.total_records,
      processedRecords: job.processed_records,
      failedRecords: job.failed_records,
      skippedRecords: job.skipped_records,
      currentBatch: job.current_batch,
      totalBatches: job.total_batches,
      progressPercent
    },
    timing: {
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      durationMs: job.duration_ms,
      estimatedRemainingMs
    },
    error: job.last_error ? {
      message: job.last_error,
      details: job.error_details,
      retryCount: job.retry_count,
      maxRetries: job.max_retries
    } : null,
    result: job.result_summary,
    workerId: job.worker_id
  };
}

/**
 * Get recent jobs (for dashboard/monitoring)
 *
 * @param {Object} [options]
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.jobType] - Filter by job type
 * @param {string} [options.createdBy] - Filter by creator
 * @param {number} [options.limit=50] - Max results
 */
async function getRecentJobs(options = {}) {
  const { status, jobType, createdBy, limit = 50 } = options;

  let query = `
    SELECT job_id, job_type, job_name, status, priority,
           total_records, processed_records, failed_records,
           current_batch, total_batches,
           created_at, started_at, completed_at,
           last_error, retry_count, created_by
    FROM sp_v2_job_queue
    WHERE 1=1
  `;
  const values = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND status = $${paramIndex++}`;
    values.push(status);
  }
  if (jobType) {
    query += ` AND job_type = $${paramIndex++}`;
    values.push(jobType);
  }
  if (createdBy) {
    query += ` AND created_by = $${paramIndex++}`;
    values.push(createdBy);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  values.push(limit);

  const result = await getPool().query(query, values);
  return result.rows;
}

/**
 * Add a log entry for a job
 *
 * @param {string} jobId - Job ID
 * @param {string} logType - Log type (INFO, ERROR, etc.)
 * @param {string} message - Log message
 * @param {Object} [details] - Additional details
 * @param {number} [batchNumber] - Batch number if applicable
 */
async function addJobLog(jobId, logType, message, details = null, batchNumber = null) {
  const query = `
    INSERT INTO sp_v2_job_queue_logs (job_id, log_type, message, details, batch_number)
    VALUES ($1, $2, $3, $4, $5)
  `;

  try {
    await getPool().query(query, [
      jobId,
      logType,
      message,
      details ? JSON.stringify(details) : null,
      batchNumber
    ]);
  } catch (error) {
    // Don't let logging errors break job processing
    console.error(`[JobQueue] Failed to write log: ${error.message}`);
  }
}

/**
 * Get logs for a job
 *
 * @param {string} jobId - Job ID
 * @param {number} [limit=100] - Max logs to return
 */
async function getJobLogs(jobId, limit = 100) {
  const query = `
    SELECT * FROM sp_v2_job_queue_logs
    WHERE job_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const result = await getPool().query(query, [jobId, limit]);
  return result.rows;
}

/**
 * Release stale job locks (call periodically from worker)
 *
 * @param {number} [staleMinutes=30] - Consider jobs stale after this many minutes
 */
async function releaseStaleJobLocks(staleMinutes = 30) {
  const query = `SELECT release_stale_job_locks($1)`;
  const result = await getPool().query(query, [staleMinutes]);
  const releasedCount = result.rows[0].release_stale_job_locks;

  if (releasedCount > 0) {
    console.log(`[JobQueue] Released ${releasedCount} stale job locks`);
  }

  return releasedCount;
}

/**
 * Cancel a job
 *
 * @param {string} jobId - Job ID
 * @param {string} [reason] - Cancellation reason
 */
async function cancelJob(jobId, reason = 'Cancelled by user') {
  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'CANCELLED',
        completed_at = NOW(),
        worker_id = NULL,
        locked_at = NULL,
        last_error = $2
    WHERE job_id = $1
      AND status IN ('QUEUED', 'PAUSED')
    RETURNING *
  `;

  const result = await getPool().query(query, [jobId, reason]);

  if (result.rows.length === 0) {
    // Check if job is processing
    const job = await getJobStatus(jobId);
    if (job && job.status === 'PROCESSING') {
      throw new Error('Cannot cancel a job that is currently processing');
    }
    return null;
  }

  console.log(`[JobQueue] Job ${jobId} cancelled: ${reason}`);
  await addJobLog(jobId, LOG_TYPE.INFO, `Job cancelled: ${reason}`);

  return result.rows[0];
}

/**
 * Pause a job (can be resumed later)
 */
async function pauseJob(jobId, reason = 'Paused by user') {
  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'PAUSED',
        worker_id = NULL,
        locked_at = NULL,
        last_error = $2
    WHERE job_id = $1
      AND status IN ('QUEUED', 'PROCESSING')
    RETURNING *
  `;

  const result = await getPool().query(query, [jobId, reason]);
  if (result.rows.length > 0) {
    await addJobLog(jobId, LOG_TYPE.INFO, `Job paused: ${reason}`);
  }
  return result.rows[0];
}

/**
 * Resume a paused job
 */
async function resumeJob(jobId) {
  const query = `
    UPDATE sp_v2_job_queue
    SET status = 'QUEUED',
        next_run_at = NOW()
    WHERE job_id = $1
      AND status = 'PAUSED'
    RETURNING *
  `;

  const result = await getPool().query(query, [jobId]);
  if (result.rows.length > 0) {
    await addJobLog(jobId, LOG_TYPE.RESUME, 'Job resumed');
  }
  return result.rows[0];
}

/**
 * Update total records count (after file parsing)
 */
async function setTotalRecords(jobId, totalRecords) {
  const query = `
    UPDATE sp_v2_job_queue
    SET total_records = $2,
        total_batches = CEIL($2::NUMERIC / (config->>'batchSize')::NUMERIC)
    WHERE job_id = $1
    RETURNING total_records, total_batches
  `;

  const result = await getPool().query(query, [jobId, totalRecords]);
  return result.rows[0];
}

// Export everything
module.exports = {
  init,
  createJob,
  acquireJob,
  updateProgress,
  saveCheckpoint,
  completeJob,
  failJob,
  retryJob,
  getJobStatus,
  getRecentJobs,
  addJobLog,
  getJobLogs,
  releaseStaleJobLocks,
  cancelJob,
  pauseJob,
  resumeJob,
  setTotalRecords,
  JOB_STATUS,
  LOG_TYPE,
  DEFAULT_CONFIGS
};
