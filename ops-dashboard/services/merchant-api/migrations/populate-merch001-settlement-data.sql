-- Migration: Populate Settlement Data for MERCH001
-- Date: 2025-10-05
-- Purpose: Add settled_at timestamps, UTR numbers, and bank transfer records

-- Step 1: Update settled_at for COMPLETED settlements
-- Sets settled_at to 1 day after creation date
UPDATE sp_v2_settlement_batches 
SET settled_at = created_at + INTERVAL '1 day'
WHERE merchant_id = 'MERCH001' 
    AND status = 'COMPLETED' 
    AND settled_at IS NULL;

-- Step 2: Generate UTR numbers
-- Format: UTR + epoch timestamp + 4 random digits
UPDATE sp_v2_settlement_batches 
SET bank_reference_number = 'UTR' || EXTRACT(EPOCH FROM created_at)::bigint || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0')
WHERE merchant_id = 'MERCH001' 
    AND status = 'COMPLETED' 
    AND (bank_reference_number IS NULL OR bank_reference_number = '');

-- Step 3: Create bank transfer records
-- Links settlement batches to actual bank transfers
INSERT INTO sp_v2_settlement_bank_transfers (
    settlement_batch_id, 
    merchant_id, 
    amount_paise, 
    bank_account_number, 
    ifsc_code, 
    transfer_mode, 
    utr_number, 
    transfer_date, 
    status, 
    created_at, 
    updated_at
)
SELECT 
    id as settlement_batch_id,
    merchant_id,
    net_amount_paise as amount_paise,
    '1234567890' as bank_account_number,
    'HDFC0001234' as ifsc_code,
    'NEFT' as transfer_mode,
    bank_reference_number as utr_number,
    settled_at::date as transfer_date,
    'COMPLETED' as status,
    settled_at as created_at,
    settled_at as updated_at
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001' 
    AND status = 'COMPLETED'
    AND settled_at IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sp_v2_settlement_bank_transfers sbt 
        WHERE sbt.settlement_batch_id = sp_v2_settlement_batches.id
    );

-- Verification queries
SELECT 
    COUNT(*) as total_settlements,
    COUNT(settled_at) as with_settled_at,
    COUNT(bank_reference_number) as with_utr
FROM sp_v2_settlement_batches
WHERE merchant_id = 'MERCH001';

SELECT COUNT(*) as bank_transfers_created 
FROM sp_v2_settlement_bank_transfers 
WHERE merchant_id = 'MERCH001';
