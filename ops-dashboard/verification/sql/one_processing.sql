-- verification/sql/one_processing.sql
-- Get one processing settlement (to verify timeline)
SELECT id
FROM sp_v2_settlement_batches
WHERE merchant_id = $1 AND status IN ('PROCESSING','APPROVED')
ORDER BY created_at DESC LIMIT 1;