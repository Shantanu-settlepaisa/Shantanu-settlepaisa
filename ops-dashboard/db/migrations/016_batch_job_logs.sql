-- Migration: Create batch job logging table
-- Version: 2.14.0
-- Date: 2025-10-03
-- Purpose: Track automated batch job execution (daily PG sync, etc.)

CREATE TABLE IF NOT EXISTS sp_v2_batch_job_logs (
    id BIGSERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    job_date DATE NOT NULL,
    merchants_processed INTEGER DEFAULT 0,
    merchants_success INTEGER DEFAULT 0,
    merchants_failed INTEGER DEFAULT 0,
    total_transactions_synced INTEGER DEFAULT 0,
    duration_seconds NUMERIC(10, 2),
    status VARCHAR(20) CHECK (status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')),
    details JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_job_logs_date ON sp_v2_batch_job_logs (job_date DESC);
CREATE INDEX IF NOT EXISTS idx_batch_job_logs_type_status ON sp_v2_batch_job_logs (job_type, status);

COMMENT ON TABLE sp_v2_batch_job_logs IS 'Logs for automated batch jobs (daily PG sync, settlement generation, etc.)';
COMMENT ON COLUMN sp_v2_batch_job_logs.job_type IS 'Type of batch job: DAILY_PG_SYNC, SETTLEMENT_GENERATION, etc.';
COMMENT ON COLUMN sp_v2_batch_job_logs.details IS 'JSON details of job execution (success/failed merchants, etc.)';
