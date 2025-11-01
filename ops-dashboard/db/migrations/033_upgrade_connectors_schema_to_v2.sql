-- Migration: Upgrade sp_v2_connectors schema to match staging 2 functionality
-- This adds missing columns needed for the full connector management features

BEGIN;

-- Add missing columns to sp_v2_connectors
ALTER TABLE sp_v2_connectors
  -- Rename existing columns to match staging 2 schema
  RENAME COLUMN connector_name TO name;

ALTER TABLE sp_v2_connectors
  RENAME COLUMN bank_name TO source_entity;

ALTER TABLE sp_v2_connectors
  RENAME COLUMN description TO connection_config_text;

-- Add new columns with proper types
ALTER TABLE sp_v2_connectors
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS connection_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(100) DEFAULT '0 2 * * *',
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_run_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_run_details JSONB,
  ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_runs INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Migrate existing data from old columns to new columns
UPDATE sp_v2_connectors
SET
  status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'PAUSED' END,
  connection_config = jsonb_build_object('description', connection_config_text),
  last_run_at = last_sync_at,
  last_run_status = health_status,
  last_run_details = CASE
    WHEN last_error_message IS NOT NULL
    THEN jsonb_build_object('error', last_error_message)
    ELSE '{}'::jsonb
  END
WHERE connection_config = '{}';

-- Drop old columns that are now replaced
ALTER TABLE sp_v2_connectors
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS connection_config_text,
  DROP COLUMN IF EXISTS last_sync_at,
  DROP COLUMN IF EXISTS last_successful_sync,
  DROP COLUMN IF EXISTS sync_frequency_minutes,
  DROP COLUMN IF EXISTS health_status,
  DROP COLUMN IF EXISTS last_error_message,
  DROP COLUMN IF EXISTS last_health_check;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_connectors_status ON sp_v2_connectors(status);
CREATE INDEX IF NOT EXISTS idx_connectors_type ON sp_v2_connectors(connector_type);
CREATE INDEX IF NOT EXISTS idx_connectors_source ON sp_v2_connectors(source_entity);

-- Add check constraint for valid status values
ALTER TABLE sp_v2_connectors
  DROP CONSTRAINT IF EXISTS check_connector_status;

ALTER TABLE sp_v2_connectors
  ADD CONSTRAINT check_connector_status
  CHECK (status IN ('ACTIVE', 'PAUSED', 'FAILED'));

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_connectors_updated_at ON sp_v2_connectors;

CREATE TRIGGER update_connectors_updated_at
  BEFORE UPDATE ON sp_v2_connectors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
