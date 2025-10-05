-- verification/sql/audit_timeline_events.sql
-- Get timeline events for a specific settlement
SELECT 
  e.id,
  e.event_type,
  e.event_detail,
  e.event_meta,
  e.created_at,
  e.settlement_batch_id
FROM sp_v2_settlement_events e
WHERE e.settlement_batch_id = $1
ORDER BY e.created_at ASC;