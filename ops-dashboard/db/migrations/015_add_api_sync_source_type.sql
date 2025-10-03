-- Migration: Add API_SYNC to source_type allowed values
-- Version: 2.13.0
-- Date: 2025-10-03
-- Purpose: Allow API_SYNC as a valid source_type for automated PG data syncing

-- Drop existing constraint
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT IF EXISTS sp_v2_transactions_source_type_check;

-- Add new constraint with API_SYNC included
ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_source_type_check 
CHECK (source_type IN ('MANUAL_UPLOAD', 'CONNECTOR', 'API_SYNC'));

-- Also update bank statements to be consistent (optional - for future use)
ALTER TABLE sp_v2_bank_statements 
DROP CONSTRAINT IF EXISTS sp_v2_bank_statements_source_type_check;

ALTER TABLE sp_v2_bank_statements 
ADD CONSTRAINT sp_v2_bank_statements_source_type_check 
CHECK (source_type IN ('MANUAL_UPLOAD', 'SFTP_CONNECTOR', 'API_SYNC'));

-- Add comment for documentation
COMMENT ON COLUMN sp_v2_transactions.source_type IS 'Source of transaction data: MANUAL_UPLOAD (CSV upload), CONNECTOR (real-time), API_SYNC (automated batch sync from PG Report API)';
COMMENT ON COLUMN sp_v2_bank_statements.source_type IS 'Source of bank data: MANUAL_UPLOAD (CSV upload), SFTP_CONNECTOR (automated SFTP fetch), API_SYNC (future: bank API integration)';
