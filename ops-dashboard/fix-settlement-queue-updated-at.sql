-- Quick fix: Add missing updated_at column to sp_v2_settlement_queue

ALTER TABLE sp_v2_settlement_queue 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Backfill with created_at for existing rows
UPDATE sp_v2_settlement_queue 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE sp_v2_settlement_queue 
ALTER COLUMN updated_at SET NOT NULL;

SELECT 'Fixed: Added updated_at column to sp_v2_settlement_queue' AS status;
