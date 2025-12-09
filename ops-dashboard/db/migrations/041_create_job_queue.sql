-- Migration: Create Job Queue System
-- Date: 2025-12-09
-- Purpose: Persistent job queue for batch processing (uploads, recon, etc.)
-- This enables:
--   1. Jobs survive server restarts
--   2. Progress checkpointing (resume from last batch)
--   3. Priority-based processing
--   4. Multiple job types with configurable batch sizes

-- ============================================================================
-- TABLE: sp_v2_job_queue
-- Main job queue table for all async batch operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS sp_v2_job_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    -- Job Type & Identity
    job_type VARCHAR(50) NOT NULL,           -- 'UPLOAD_PG', 'UPLOAD_BANK', 'RECONCILIATION', 'SETTLEMENT'
    job_name VARCHAR(255),                   -- Human-readable name for display

    -- Job Configuration (immutable after creation)
    config JSONB NOT NULL DEFAULT '{}',      -- { batchSize, maxRetries, batchDelay, ... }

    -- Input Data Reference
    payload_path TEXT,                       -- Path to uploaded file (local or S3)
    payload_metadata JSONB,                  -- { fileName, fileSize, fileType, contentType, ... }

    -- Processing State
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    priority INTEGER NOT NULL DEFAULT 5,     -- 1=highest (urgent), 10=lowest (background)

    -- Progress Tracking
    total_records INTEGER,                   -- Total records to process (set after file parse)
    processed_records INTEGER DEFAULT 0,     -- Successfully processed
    failed_records INTEGER DEFAULT 0,        -- Failed records (validation errors, etc.)
    skipped_records INTEGER DEFAULT 0,       -- Duplicates or already processed
    current_batch INTEGER DEFAULT 0,         -- Current batch number (1-indexed)
    total_batches INTEGER,                   -- Total number of batches

    -- Checkpoint for Resume (updated after each batch)
    last_checkpoint JSONB,                   -- { lastProcessedRow, lastBatchEnd, batchResults: [...] }

    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,    -- When processing actually began
    completed_at TIMESTAMP WITH TIME ZONE,  -- When job finished (success or fail)
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  -- For scheduled/delayed jobs

    -- Error Handling & Retries
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,                         -- Last error message
    error_details JSONB,                     -- Full error context { stack, code, ... }

    -- Ownership & Tracking
    created_by VARCHAR(255),                 -- User who created the job
    worker_id VARCHAR(100),                  -- Which worker instance is processing
    locked_at TIMESTAMP WITH TIME ZONE,     -- When worker acquired lock

    -- Result Summary (populated on completion)
    result_summary JSONB,                    -- { inserted, duplicates, errors, duration, ... }

    -- Constraints
    CONSTRAINT valid_job_status CHECK (status IN (
        'QUEUED',      -- Waiting to be picked up
        'PROCESSING',  -- Currently being processed by a worker
        'COMPLETED',   -- Successfully finished
        'FAILED',      -- Failed after max retries
        'PAUSED',      -- Manually paused
        'CANCELLED'    -- Manually cancelled
    )),
    CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 10),
    CONSTRAINT valid_job_type CHECK (job_type IN (
        'UPLOAD_PG',
        'UPLOAD_BANK',
        'RECONCILIATION',
        'SETTLEMENT',
        'EXPORT',
        'CLEANUP'
    ))
);

-- ============================================================================
-- INDEXES for efficient worker polling and status queries
-- ============================================================================

-- Primary index for worker polling: find next job to process
-- Uses (status, priority, next_run_at) for optimal query:
-- SELECT ... WHERE status = 'QUEUED' AND next_run_at <= NOW() ORDER BY priority, created_at LIMIT 1
CREATE INDEX IF NOT EXISTS idx_job_queue_polling
ON sp_v2_job_queue(status, priority, next_run_at, created_at)
WHERE status = 'QUEUED';

-- Index for finding jobs by worker (detect stale locks)
CREATE INDEX IF NOT EXISTS idx_job_queue_worker
ON sp_v2_job_queue(worker_id, status, locked_at)
WHERE worker_id IS NOT NULL;

-- Index for user's job history
CREATE INDEX IF NOT EXISTS idx_job_queue_user
ON sp_v2_job_queue(created_by, created_at DESC);

-- Index for job type filtering
CREATE INDEX IF NOT EXISTS idx_job_queue_type_status
ON sp_v2_job_queue(job_type, status, created_at DESC);

-- Index for finding stuck/stale jobs
CREATE INDEX IF NOT EXISTS idx_job_queue_stuck
ON sp_v2_job_queue(status, locked_at)
WHERE status = 'PROCESSING';

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_job_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_queue_updated_at ON sp_v2_job_queue;
CREATE TRIGGER job_queue_updated_at
    BEFORE UPDATE ON sp_v2_job_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_job_queue_timestamp();

-- ============================================================================
-- TABLE: sp_v2_job_queue_logs
-- Detailed logs for each job (batch completions, errors, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sp_v2_job_queue_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES sp_v2_job_queue(job_id) ON DELETE CASCADE,

    log_type VARCHAR(20) NOT NULL,           -- 'INFO', 'WARN', 'ERROR', 'BATCH_COMPLETE', 'CHECKPOINT'
    message TEXT NOT NULL,
    details JSONB,                           -- Additional context

    batch_number INTEGER,                    -- Which batch this log is for
    records_in_batch INTEGER,                -- Records processed in this batch

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_log_type CHECK (log_type IN (
        'INFO', 'WARN', 'ERROR', 'BATCH_START', 'BATCH_COMPLETE', 'CHECKPOINT', 'RETRY', 'RESUME'
    ))
);

-- Index for fetching logs by job
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id
ON sp_v2_job_queue_logs(job_id, created_at DESC);

-- Partial index for error logs only
CREATE INDEX IF NOT EXISTS idx_job_logs_errors
ON sp_v2_job_queue_logs(job_id, created_at DESC)
WHERE log_type = 'ERROR';

-- ============================================================================
-- FUNCTION: Acquire next job for processing (with row-level locking)
-- This prevents multiple workers from grabbing the same job
-- ============================================================================
CREATE OR REPLACE FUNCTION acquire_next_job(
    p_worker_id VARCHAR(100),
    p_job_types VARCHAR(50)[] DEFAULT NULL,
    p_max_priority INTEGER DEFAULT 10
)
RETURNS TABLE (
    job_id UUID,
    job_type VARCHAR(50),
    config JSONB,
    payload_path TEXT,
    payload_metadata JSONB,
    total_records INTEGER,
    processed_records INTEGER,
    current_batch INTEGER,
    last_checkpoint JSONB,
    retry_count INTEGER
) AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Find and lock the next available job
    SELECT jq.job_id INTO v_job_id
    FROM sp_v2_job_queue jq
    WHERE jq.status = 'QUEUED'
      AND jq.next_run_at <= NOW()
      AND jq.priority <= p_max_priority
      AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
    ORDER BY jq.priority ASC, jq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- If no job found, return empty
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    -- Update job to PROCESSING status
    UPDATE sp_v2_job_queue jq
    SET status = 'PROCESSING',
        worker_id = p_worker_id,
        locked_at = NOW(),
        started_at = COALESCE(started_at, NOW())
    WHERE jq.job_id = v_job_id;

    -- Return job details
    RETURN QUERY
    SELECT
        jq.job_id,
        jq.job_type,
        jq.config,
        jq.payload_path,
        jq.payload_metadata,
        jq.total_records,
        jq.processed_records,
        jq.current_batch,
        jq.last_checkpoint,
        jq.retry_count
    FROM sp_v2_job_queue jq
    WHERE jq.job_id = v_job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Release stale job locks (for jobs that crashed mid-processing)
-- Run this periodically to recover from worker crashes
-- ============================================================================
CREATE OR REPLACE FUNCTION release_stale_job_locks(
    p_stale_threshold_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    WITH stale_jobs AS (
        UPDATE sp_v2_job_queue
        SET status = 'QUEUED',
            worker_id = NULL,
            locked_at = NULL,
            retry_count = retry_count + 1,
            last_error = 'Worker timeout - job released for retry',
            next_run_at = NOW() + INTERVAL '10 seconds'
        WHERE status = 'PROCESSING'
          AND locked_at < NOW() - (p_stale_threshold_minutes || ' minutes')::INTERVAL
          AND retry_count < max_retries
        RETURNING job_id
    )
    SELECT COUNT(*) INTO v_released_count FROM stale_jobs;

    -- Mark jobs that exceeded max retries as FAILED
    UPDATE sp_v2_job_queue
    SET status = 'FAILED',
        completed_at = NOW(),
        last_error = 'Max retries exceeded after worker timeout'
    WHERE status = 'PROCESSING'
      AND locked_at < NOW() - (p_stale_threshold_minutes || ' minutes')::INTERVAL
      AND retry_count >= max_retries;

    RETURN v_released_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS for documentation
-- ============================================================================
COMMENT ON TABLE sp_v2_job_queue IS 'Persistent job queue for batch processing operations';
COMMENT ON COLUMN sp_v2_job_queue.config IS 'Job configuration: { batchSize, maxRetries, batchDelay, ... }';
COMMENT ON COLUMN sp_v2_job_queue.last_checkpoint IS 'Resume point: { lastProcessedRow, batchResults }';
COMMENT ON COLUMN sp_v2_job_queue.next_run_at IS 'When job should next be processed (for delays/scheduling)';
COMMENT ON FUNCTION acquire_next_job IS 'Atomically acquire next available job with row-level locking';
COMMENT ON FUNCTION release_stale_job_locks IS 'Release jobs from crashed workers back to queue';
