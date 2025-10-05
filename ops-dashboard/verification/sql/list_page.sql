-- list_page.sql — db mirror of history list (page 1)
SELECT b.id, b.settlement_type as type, b.status, b.created_at, b.net_amount_paise,
       COALESCE(t.utr_number,'') AS utr
FROM sp_v2_settlement_batches b
LEFT JOIN sp_v2_bank_transfer_queue t ON t.batch_id=b.id
WHERE b.merchant_id=$1
ORDER BY b.created_at DESC
LIMIT 25 OFFSET 0;