-- SettlePaisa V2 Demo Merchant Data Seeding Script
-- Creates comprehensive sample data for merchant dashboard testing

-- Sample Merchant Profile
INSERT INTO sp_v2_merchant_master (
    merchant_id, merchant_name, merchant_email,
    rolling_reserve_enabled, rolling_reserve_percentage, reserve_hold_days,
    settlement_cycle, is_active, synced_at
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Demo Electronics Store',
    'demo@electronics-store.com',
    true,
    5.0,  -- 5% rolling reserve
    7,    -- T+7 reserve release
    1,    -- Daily settlements
    true,
    NOW()
) ON CONFLICT (merchant_id) DO UPDATE SET
    merchant_name = EXCLUDED.merchant_name,
    updated_at = NOW();

-- Merchant Settlement Configuration
INSERT INTO sp_v2_merchant_settlement_config (
    merchant_id, settlement_frequency, settlement_day, settlement_time,
    auto_settle, min_settlement_amount_paise,
    account_holder_name, account_number, ifsc_code, bank_name,
    preferred_transfer_mode, is_active
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'daily',
    NULL,  -- Not needed for daily
    '14:00:00',  -- 2:00 PM IST cutoff
    true,
    100000,  -- ₹1,000 minimum
    'Demo Electronics Store',
    '1234567890123456',
    'HDFC0001234',
    'HDFC Bank',
    'NEFT',
    true
) ON CONFLICT (merchant_id) DO UPDATE SET
    settlement_time = EXCLUDED.settlement_time,
    updated_at = NOW();

-- Commission Configuration (UPI)
INSERT INTO sp_v2_merchant_commission_config (
    merchant_id, payment_mode, payment_mode_id, commission_value,
    commission_type, gst_percentage, is_active
) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'UPI', '6', 0.5, 'percentage', 18.0, true),
    ('11111111-1111-1111-1111-111111111111', 'DEBIT_CARD', '1', 1.5, 'percentage', 18.0, true),
    ('11111111-1111-1111-1111-111111111111', 'CREDIT_CARD', '2', 2.0, 'percentage', 18.0, true),
    ('11111111-1111-1111-1111-111111111111', 'NETBANKING', '3', 1.0, 'percentage', 18.0, true)
ON CONFLICT (merchant_id, payment_mode) DO UPDATE SET
    commission_value = EXCLUDED.commission_value,
    updated_at = NOW();

-- Fee Bearer Configuration
INSERT INTO sp_v2_merchant_fee_bearer_config (
    merchant_id, payment_mode_id, fee_bearer_code, is_active
) VALUES 
    ('11111111-1111-1111-1111-111111111111', '6', '2', true),  -- UPI: Merchant pays
    ('11111111-1111-1111-1111-111111111111', '1', '2', true),  -- Debit: Merchant pays  
    ('11111111-1111-1111-1111-111111111111', '2', '1', true),  -- Credit: Customer pays
    ('11111111-1111-1111-1111-111111111111', '3', '2', true)   -- NetBanking: Merchant pays
ON CONFLICT (merchant_id, payment_mode_id) DO UPDATE SET
    fee_bearer_code = EXCLUDED.fee_bearer_code,
    updated_at = NOW();

-- Settlement Batches (30 days of history)
WITH settlement_data AS (
    SELECT 
        gen_random_uuid() as batch_id,
        '11111111-1111-1111-1111-111111111111' as merchant_id,
        'Demo Electronics Store' as merchant_name,
        (CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 29)) as cycle_date,
        generate_series(0, 29) as day_offset
),
amounts AS (
    SELECT *,
        -- Generate realistic amounts (₹50k to ₹300k)
        (50000 + (day_offset * 8333) + (random() * 100000))::bigint * 100 as gross_amount_paise,
        -- Determine status based on recency
        CASE 
            WHEN day_offset = 0 THEN 'PROCESSING'
            WHEN day_offset = 1 THEN 'APPROVED' 
            WHEN day_offset <= 5 AND random() < 0.1 THEN 'PROCESSING'
            ELSE 'SETTLED'
        END as status,
        -- Random transaction count
        (100 + (random() * 400))::int as total_transactions
    FROM settlement_data
),
calculated AS (
    SELECT *,
        -- Calculate fees (2% average)
        (gross_amount_paise * 0.02)::bigint as total_commission_paise,
        -- Calculate GST (18% on commission)
        ((gross_amount_paise * 0.02) * 0.18)::bigint as total_gst_paise,
        -- Calculate reserve (5% of net)
        ((gross_amount_paise * 0.95) * 0.05)::bigint as total_reserve_paise
    FROM amounts
),
final_amounts AS (
    SELECT *,
        (gross_amount_paise - total_commission_paise - total_gst_paise - total_reserve_paise) as net_amount_paise,
        CASE 
            WHEN status = 'SETTLED' THEN 'HDFC' || to_char(cycle_date, 'YYMMDD') || lpad((day_offset + 1)::text, 6, '0')
            ELSE NULL 
        END as bank_reference_number,
        CASE 
            WHEN status = 'SETTLED' THEN cycle_date + INTERVAL '1 day' + INTERVAL '6 hours'
            ELSE NULL
        END as settlement_completed_at
    FROM calculated
)
INSERT INTO sp_v2_settlement_batches (
    id, merchant_id, merchant_name, cycle_date, total_transactions,
    gross_amount_paise, total_commission_paise, total_gst_paise, 
    total_reserve_paise, net_amount_paise, status,
    bank_reference_number, settlement_completed_at,
    created_at, updated_at
)
SELECT 
    batch_id, merchant_id, merchant_name, cycle_date, total_transactions,
    gross_amount_paise, total_commission_paise, total_gst_paise,
    total_reserve_paise, net_amount_paise, status,
    bank_reference_number, settlement_completed_at,
    cycle_date + INTERVAL '2 hours' as created_at,  -- Created at 2 AM next day
    COALESCE(settlement_completed_at, cycle_date + INTERVAL '2 hours') as updated_at
FROM final_amounts
ON CONFLICT (id) DO NOTHING;

-- Add one instant settlement (today)
INSERT INTO sp_v2_settlement_batches (
    id, merchant_id, merchant_name, cycle_date, total_transactions,
    gross_amount_paise, total_commission_paise, total_gst_paise,
    total_reserve_paise, net_amount_paise, status,
    bank_reference_number, settlement_completed_at,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'Demo Electronics Store',
    CURRENT_DATE,
    1,  -- Single instant settlement
    5000000,  -- ₹50,000
    60000,    -- 1.2% instant fee  
    10800,    -- 18% GST
    0,        -- No reserve for instant
    4929200,  -- Net amount
    'SETTLED',
    'INST' || extract(epoch from now())::text,
    NOW() - INTERVAL '2 hours',  -- Settled 2 hours ago
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Bank Transfer Queue (for recent settlements)
INSERT INTO sp_v2_bank_transfer_queue (
    id, batch_id, transfer_mode, amount_paise, 
    beneficiary_name, account_number, ifsc_code,
    status, utr_number, queued_at, sent_at, completed_at
)
SELECT 
    gen_random_uuid(),
    sb.id,
    'NEFT' as transfer_mode,
    sb.net_amount_paise,
    'Demo Electronics Store',
    '1234567890123456',
    'HDFC0001234',
    CASE 
        WHEN sb.status = 'SETTLED' THEN 'completed'
        WHEN sb.status = 'PROCESSING' THEN 'processing'
        ELSE 'queued'
    END as status,
    CASE 
        WHEN sb.status = 'SETTLED' THEN sb.bank_reference_number
        ELSE NULL
    END as utr_number,
    sb.created_at + INTERVAL '4 hours' as queued_at,
    CASE 
        WHEN sb.status IN ('SETTLED', 'PROCESSING') THEN sb.created_at + INTERVAL '5 hours'
        ELSE NULL
    END as sent_at,
    sb.settlement_completed_at
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.cycle_date >= CURRENT_DATE - INTERVAL '7 days'
ON CONFLICT DO NOTHING;

-- Settlement Timeline Events
INSERT INTO sp_v2_settlement_timeline_events (
    settlement_id, event_type, occurred_at, detail, reason, meta
)
SELECT 
    sb.id,
    'INITIATED',
    sb.created_at,
    'Settlement request initiated',
    NULL,
    NULL
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.cycle_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
    sb.id,
    'BATCHED',
    sb.created_at + INTERVAL '1 minute',
    'Added to settlement batch',
    NULL,
    NULL
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.cycle_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- BANK_FILE_AWAITED for processing settlements
SELECT 
    sb.id,
    'BANK_FILE_AWAITED',
    sb.created_at + INTERVAL '2 minutes',
    'Awaiting confirmation from the bank',
    'AWAITING_BANK_FILE',
    jsonb_build_object(
        'expectedByIST', (sb.created_at + INTERVAL '6 hours')::text,
        'bank', 'HDFC Bank'
    )
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.status = 'PROCESSING'

UNION ALL

-- Full timeline for completed settlements
SELECT 
    sb.id,
    'BANK_FILE_RECEIVED',
    sb.created_at + INTERVAL '4 hours',
    'Bank confirmation file received',
    NULL,
    NULL
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.status = 'SETTLED'

UNION ALL

SELECT 
    sb.id,
    'UTR_ASSIGNED',
    sb.settlement_completed_at - INTERVAL '30 minutes',
    'Bank UTR: ' || sb.bank_reference_number,
    NULL,
    NULL
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.status = 'SETTLED'
  AND sb.bank_reference_number IS NOT NULL

UNION ALL

SELECT 
    sb.id,
    'SETTLED',
    sb.settlement_completed_at,
    'Amount credited to bank account',
    NULL,
    jsonb_build_object(
        'bank', 'HDFC Bank',
        'account', '****3456'
    )
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.status = 'SETTLED'
  AND sb.settlement_completed_at IS NOT NULL

ON CONFLICT DO NOTHING;

-- Rolling Reserve Ledger
INSERT INTO sp_v2_rolling_reserve_ledger (
    id, settlement_batch_id, merchant_id,
    reserve_amount_paise, released_amount_paise, balance_paise,
    hold_date, release_date, status,
    reserve_percentage, hold_days
)
SELECT 
    gen_random_uuid(),
    sb.id,
    sb.merchant_id,
    sb.total_reserve_paise,
    CASE 
        WHEN sb.cycle_date <= CURRENT_DATE - INTERVAL '7 days' THEN sb.total_reserve_paise
        ELSE 0
    END as released_amount_paise,
    CASE 
        WHEN sb.cycle_date <= CURRENT_DATE - INTERVAL '7 days' THEN 0
        ELSE sb.total_reserve_paise
    END as balance_paise,
    sb.cycle_date,
    sb.cycle_date + INTERVAL '7 days' as release_date,
    CASE 
        WHEN sb.cycle_date <= CURRENT_DATE - INTERVAL '7 days' THEN 'RELEASED'
        ELSE 'HELD'
    END as status,
    5.0,  -- 5% reserve
    7     -- 7 days hold
FROM sp_v2_settlement_batches sb
WHERE sb.merchant_id = '11111111-1111-1111-1111-111111111111'
  AND sb.total_reserve_paise > 0
ON CONFLICT DO NOTHING;

-- Sample Transactions (for the processing settlement)
INSERT INTO sp_v2_transactions (
    transaction_id, merchant_id, amount_paise, transaction_date,
    transaction_timestamp, source_type, payment_method, utr, 
    status, settlement_batch_id, acquirer_code, merchant_name
)
SELECT 
    'TXN_DEMO_' || generate_series(1, 50),
    '11111111-1111-1111-1111-111111111111',
    (1000 + random() * 50000)::bigint * 100,  -- ₹1k to ₹50k
    CURRENT_DATE - 1,
    CURRENT_DATE - 1 + (random() * INTERVAL '18 hours'),
    'API_SYNC',
    CASE (random() * 4)::int
        WHEN 0 THEN 'UPI'
        WHEN 1 THEN 'DEBIT_CARD' 
        WHEN 2 THEN 'CREDIT_CARD'
        ELSE 'NETBANKING'
    END,
    'UTR' || (1000000000 + random() * 999999999)::bigint,
    'RECONCILED',
    (SELECT id FROM sp_v2_settlement_batches 
     WHERE merchant_id = '11111111-1111-1111-1111-111111111111' 
       AND status = 'PROCESSING' 
     LIMIT 1),
    'HDFC',
    'Demo Electronics Store'
ON CONFLICT (transaction_id) DO NOTHING;

-- Daily KPIs (for insights)
INSERT INTO sp_v2_daily_kpis (
    summary_date, total_transactions, total_amount_paise,
    matched_transactions, matched_amount_paise,
    unmatched_transactions, exception_transactions,
    match_rate_percentage, captured_count, in_settlement_count,
    sent_to_bank_count, credited_count, unsettled_count,
    calculated_at
)
SELECT 
    date_series.date_val,
    (50 + random() * 200)::int as total_transactions,
    ((50000 + random() * 250000) * 100)::bigint as total_amount_paise,
    (45 + random() * 180)::int as matched_transactions,
    ((45000 + random() * 225000) * 100)::bigint as matched_amount_paise,
    (random() * 10)::int as unmatched_transactions,
    (random() * 5)::int as exception_transactions,
    (85 + random() * 12)::numeric(5,2) as match_rate_percentage,
    (40 + random() * 160)::int as captured_count,
    (35 + random() * 140)::int as in_settlement_count,
    (30 + random() * 120)::int as sent_to_bank_count,
    (28 + random() * 110)::int as credited_count,
    (random() * 20)::int as unsettled_count,
    NOW()
FROM generate_series(
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE - INTERVAL '1 day',
    INTERVAL '1 day'
) AS date_series(date_val)
ON CONFLICT (summary_date) DO UPDATE SET
    calculated_at = NOW();

-- Output success message
SELECT 
    'Demo merchant data seeded successfully!' as status,
    (SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE merchant_id = '11111111-1111-1111-1111-111111111111') as settlement_batches,
    (SELECT COUNT(*) FROM sp_v2_settlement_timeline_events WHERE settlement_id IN 
        (SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = '11111111-1111-1111-1111-111111111111')) as timeline_events,
    (SELECT COUNT(*) FROM sp_v2_transactions WHERE merchant_id = '11111111-1111-1111-1111-111111111111') as transactions;