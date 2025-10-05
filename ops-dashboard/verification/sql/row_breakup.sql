-- row_breakup.sql — breakdown components for a given row
-- params: $1 merchant_id, $2 settlement_id
SELECT b.id,
       COALESCE(b.gross_amount_paise,0)    AS gross_paise,
       COALESCE(b.fees_paise,0)            AS fees_paise,
       COALESCE(b.tax_paise,0)             AS taxes_paise,
       COALESCE(b.tds_paise,0)             AS tds_paise,
       COALESCE(b.reserve_amount_paise,0)  AS reserve_paise,
       b.net_amount_paise
FROM sp_v2_settlement_batches b
WHERE b.merchant_id=$1 AND b.id=$2;