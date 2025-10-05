-- verification/sql/unsettled_net.sql
-- Get total unsettled amount (truth for Current Balance)
SELECT COALESCE(SUM(net_amount_paise),0) AS unsettled_net_paise
FROM sp_v2_settlement_batches
WHERE merchant_id = $1
  AND status IN ('PROCESSING','APPROVED');