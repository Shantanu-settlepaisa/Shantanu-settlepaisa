-- verification/sql/settlement_config.sql
-- Get settlement configuration (cutoff & T+N)
SELECT 
  CASE 
    WHEN settlement_frequency = 'daily' THEN 1
    WHEN settlement_frequency = 'weekly' THEN 7
    ELSE 1
  END as t_plus_days,
  EXTRACT(HOUR FROM settlement_time::time) * 60 + EXTRACT(MINUTE FROM settlement_time::time) as cutoff_minutes_ist
FROM sp_v2_merchant_settlement_config
WHERE merchant_id = $1;