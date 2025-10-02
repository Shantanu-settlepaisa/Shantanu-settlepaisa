-- Generate 40 days of historical data for SettlePaisa V2
-- Run this script: docker exec -i settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 < generate-historical-data.sql

BEGIN;

-- Clear existing data (keep original 5 records)
DELETE FROM sp_v2_recon_matches;
DELETE FROM sp_v2_utr_credits WHERE id::text NOT LIKE '650e8400%';
DELETE FROM sp_v2_transactions_v1 WHERE id::text NOT LIKE '650e8400%';

-- Function to generate random data
CREATE OR REPLACE FUNCTION generate_historical_data()
RETURNS void AS $$
DECLARE
    day_offset int;
    target_date date;
    daily_txn_count int;
    i int;
    txn_id uuid;
    credit_id uuid;
    merchant_ids uuid[] := ARRAY[
        '550e8400-e29b-41d4-a716-446655440001'::uuid,
        '550e8400-e29b-41d4-a716-446655440002'::uuid,
        '550e8400-e29b-41d4-a716-446655440003'::uuid
    ];
    acquirers text[] := ARRAY['HDFC BANK', 'ICICI BANK', 'AXIS BANK', 'SBI'];
    payment_modes text[] := ARRAY['UPI', 'NEFT', 'IMPS', 'CARD'];
    statuses text[] := ARRAY['SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED']; -- 90% success
BEGIN
    -- Generate data for 40 days
    FOR day_offset IN 1..40 LOOP
        target_date := CURRENT_DATE - INTERVAL '1 day' * day_offset;
        daily_txn_count := 50 + floor(random() * 100)::int; -- 50-150 transactions per day
        
        -- Generate transactions for this day
        FOR i IN 1..daily_txn_count LOOP
            txn_id := gen_random_uuid();
            
            INSERT INTO sp_v2_transactions_v1 (
                id, merchant_id, pgw_ref, amount_paise, utr, payment_mode, status, created_at
            ) VALUES (
                txn_id,
                merchant_ids[1 + floor(random() * 3)::int],
                'PG_' || to_char(target_date, 'YYYYMMDD') || '_' || i,
                (1000 + floor(random() * 49000))::bigint, -- ₹10 to ₹500
                'UTR' || to_char(target_date, 'YYYYMMDD') || lpad(i::text, 4, '0'),
                payment_modes[1 + floor(random() * 4)::int],
                statuses[1 + floor(random() * 10)::int],
                target_date + (random() * interval '24 hours')
            );
        END LOOP;
        
        -- Generate bank credits (80% of successful transactions)
        INSERT INTO sp_v2_utr_credits (id, utr, acquirer, amount_paise, credited_at, cycle_date, bank_reference)
        SELECT 
            gen_random_uuid(),
            utr,
            acquirers[1 + floor(random() * 4)::int],
            amount_paise,
            created_at + interval '2 hours' + (random() * interval '10 hours'),
            target_date,
            'REF' || floor(random() * 1000000)::text
        FROM sp_v2_transactions_v1 
        WHERE date(created_at) = target_date 
        AND status = 'SUCCESS'
        AND random() < 0.8; -- 80% get credited
        
    END LOOP;
    
    RAISE NOTICE 'Generated historical data for 40 days';
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT generate_historical_data();

-- Drop the function
DROP FUNCTION generate_historical_data();

-- Generate summary statistics
SELECT 
    'SUMMARY STATISTICS' as info,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful_txns,
    ROUND(SUM(amount_paise)::numeric / 100, 2) as total_volume_rs,
    MIN(DATE(created_at)) as earliest_date,
    MAX(DATE(created_at)) as latest_date
FROM sp_v2_transactions_v1;

SELECT 
    'CREDIT STATISTICS' as info,
    COUNT(*) as total_credits,
    ROUND(SUM(amount_paise)::numeric / 100, 2) as total_credit_volume_rs,
    MIN(DATE(credited_at)) as earliest_credit_date,
    MAX(DATE(credited_at)) as latest_credit_date
FROM sp_v2_utr_credits;

COMMIT;

-- Display final counts
SELECT 
    schemaname, 
    relname as table_name, 
    n_tup_ins as total_rows 
FROM pg_stat_user_tables 
WHERE schemaname = 'public' 
AND relname IN ('sp_v2_transactions_v1', 'sp_v2_utr_credits', 'sp_v2_recon_matches')
ORDER BY n_tup_ins DESC;