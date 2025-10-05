-- verification/sql/one_completed_with_utr.sql
-- Get completed settlement with UTR (sanity for history join)
SELECT b.id, t.utr_number as utr, b.bank_reference_number as bank_ref
FROM sp_v2_settlement_batches b
LEFT JOIN sp_v2_bank_transfer_queue t ON t.batch_id=b.id
WHERE b.merchant_id=$1 AND b.status='SETTLED'
ORDER BY b.settlement_completed_at DESC LIMIT 1;