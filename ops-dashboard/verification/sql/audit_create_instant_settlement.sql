-- verification/sql/audit_create_instant_settlement.sql
-- Create test instant settlement for audit
INSERT INTO sp_v2_settlement_batches (
  id,
  merchant_id,
  settlement_type,
  gross_amount_paise,
  net_amount_paise,
  fees_paise,
  tax_paise,
  tds_paise,
  reserve_amount_paise,
  status,
  created_at,
  updated_at
) VALUES (
  $1, -- id (uuid)
  $2, -- merchant_id
  'instant',
  $3, -- gross_amount_paise
  $4, -- net_amount_paise
  $5, -- fees_paise
  $6, -- tax_paise
  0,  -- tds_paise
  0,  -- reserve_amount_paise
  'PENDING',
  NOW(),
  NOW()
) RETURNING id, gross_amount_paise, net_amount_paise, status;