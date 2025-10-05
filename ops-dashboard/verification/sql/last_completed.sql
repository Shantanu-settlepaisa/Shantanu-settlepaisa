-- verification/sql/last_completed.sql
-- Get latest completed settlement (truth for Previous Settlement)
SELECT id, net_amount_paise, settlement_completed_at as settled_at
FROM sp_v2_settlement_batches
WHERE merchant_id = $1 AND status='SETTLED'
ORDER BY settlement_completed_at DESC
LIMIT 1;