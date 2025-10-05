-- verification/sql/audit_settlement_breakdown.sql
-- Get settlement breakdown for mathematical validation
SELECT 
  b.id,
  b.gross_amount_paise,
  b.net_amount_paise,
  b.fees_paise,
  b.tax_paise,
  b.tds_paise,
  b.reserve_amount_paise,
  b.status,
  -- Calculated validation
  (b.gross_amount_paise - b.fees_paise - b.tax_paise - COALESCE(b.tds_paise, 0) - COALESCE(b.reserve_amount_paise, 0)) as calculated_net
FROM sp_v2_settlement_batches b
WHERE b.merchant_id = $1
ORDER BY b.created_at DESC
LIMIT 5;