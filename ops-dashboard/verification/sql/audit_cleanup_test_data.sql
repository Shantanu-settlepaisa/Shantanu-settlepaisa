-- verification/sql/audit_cleanup_test_data.sql
-- Clean up test data created during audit
DELETE FROM sp_v2_settlement_events 
WHERE settlement_batch_id IN (
  SELECT id FROM sp_v2_settlement_batches 
  WHERE merchant_id = $1 AND settlement_type = 'instant' 
  AND created_at > NOW() - INTERVAL '1 hour'
);

DELETE FROM sp_v2_settlement_batches 
WHERE merchant_id = $1 
AND settlement_type = 'instant' 
AND created_at > NOW() - INTERVAL '1 hour';