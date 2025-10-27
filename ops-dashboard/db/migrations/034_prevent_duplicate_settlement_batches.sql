-- Migration 034: Prevent Duplicate Settlement Batches
-- Created: 2025-10-27
-- Purpose: Add unique constraint to prevent duplicate settlement batches for same merchant + cycle_date

-- Add unique partial index to prevent duplicates
-- Only apply to non-cancelled/non-rejected batches
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_unique_settlement_batch_merchant_date
ON sp_v2_settlement_batches (merchant_id, DATE(cycle_date))
WHERE status IN ('CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_BANK', 'CREDITED');

-- Add comment explaining the constraint
COMMENT ON INDEX idx_unique_settlement_batch_merchant_date IS
'Prevents duplicate settlement batches for the same merchant and cycle date.
Allows only one active batch per merchant per day.
Excludes CANCELLED and REJECTED batches to allow retries.';
