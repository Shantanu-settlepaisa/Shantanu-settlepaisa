-- Migration 025: Add settlement_type column to sp_v2_settlement_batches
-- Date: 2025-10-21
-- Purpose: Enable on-demand and instant settlement features
-- Issue: Merchant API expects settlement_type column but it doesn't exist

BEGIN;

-- ============================================================================
-- Add settlement_type column
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔧 Migration 025: Adding settlement_type column...';
END $$;

-- Add settlement_type column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sp_v2_settlement_batches'
    AND column_name = 'settlement_type'
  ) THEN
    ALTER TABLE sp_v2_settlement_batches
    ADD COLUMN settlement_type VARCHAR(20) DEFAULT 'automatic'
    CHECK (settlement_type IN ('automatic', 'on_demand', 'instant'));

    RAISE NOTICE '✅ Added settlement_type column';
  ELSE
    RAISE NOTICE '⚠️  settlement_type column already exists, skipping';
  END IF;
END $$;

-- Add priority column for queue processing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sp_v2_settlement_batches'
    AND column_name = 'priority'
  ) THEN
    ALTER TABLE sp_v2_settlement_batches
    ADD COLUMN priority INTEGER DEFAULT 0
    CHECK (priority IN (0, 1, 2)); -- 0=standard, 1=express, 2=instant

    RAISE NOTICE '✅ Added priority column';
  ELSE
    RAISE NOTICE '⚠️  priority column already exists, skipping';
  END IF;
END $$;

-- Create index for filtering by settlement_type
CREATE INDEX IF NOT EXISTS idx_settlement_batches_type
  ON sp_v2_settlement_batches(settlement_type);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_priority
  ON sp_v2_settlement_batches(priority DESC)
  WHERE status = 'PENDING_APPROVAL';

-- Update existing records to have settlement_type = 'automatic'
UPDATE sp_v2_settlement_batches
SET settlement_type = 'automatic'
WHERE settlement_type IS NULL;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN sp_v2_settlement_batches.settlement_type IS
  'Type of settlement: automatic (T+1), on_demand (merchant-triggered), instant (T+0)';

COMMENT ON COLUMN sp_v2_settlement_batches.priority IS
  'Priority level: 0=standard, 1=express, 2=instant';

-- ============================================================================
-- Migration Complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 025 completed successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  ✓ Added settlement_type column to sp_v2_settlement_batches';
  RAISE NOTICE '  ✓ Added priority column to sp_v2_settlement_batches';
  RAISE NOTICE '  ✓ Created indexes for settlement_type and priority';
  RAISE NOTICE '  ✓ Updated existing records to settlement_type = automatic';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  - automatic: Standard T+1 settlements (default)';
  RAISE NOTICE '  - on_demand: Merchant clicks "Settle Now" button';
  RAISE NOTICE '  - instant: T+0 settlements (auto-processed immediately)';
  RAISE NOTICE '';
END $$;

COMMIT;
