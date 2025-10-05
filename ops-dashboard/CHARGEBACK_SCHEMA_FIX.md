# Chargeback Schema Issues & Fix

## Problem Identified

You correctly identified a **critical schema design flaw** in the `sp_v2_chargebacks` table:

### Issue 1: Acquirer vs Card Network Confusion
- **Current State**: The `acquirer` field stores card networks (VISA, MASTERCARD, RUPAY)
- **Expected State**: The `acquirer` field should store acquiring banks (HDFC, AXIS, ICICI, SBI)
- **Impact**: This prevents proper analysis of which banks have chargeback issues

### Issue 2: Missing Transaction Relationship
- **Current State**: No foreign key relationship between `sp_v2_chargebacks` and `sp_v2_transactions`
- **Expected State**: Every chargeback should link to its original transaction
- **Impact**: Cannot join chargeback data with transaction data for analysis

## Current Schema Issues

```sql
-- WRONG: Acquirer field has card networks
SELECT DISTINCT acquirer FROM sp_v2_chargebacks;
-- Returns: VISA, MASTERCARD, RUPAY, PHONEPE, PAYTM
-- Should return: HDFC, ICICI, AXIS, SBI, etc.

-- WRONG: No foreign key to transactions table
-- Chargebacks have txn_ref, utr, rrn but no direct FK relationship
```

## Correct Schema Design

### Transactions Table (Already Correct)
```
sp_v2_transactions:
  - transaction_id (unique)
  - acquirer_code: HDFC, ICICI, AXIS ✓ CORRECT
  - payment_method: CARD, UPI, NETBANKING ✓ CORRECT
  - utr, rrn (for matching)
```

### Chargebacks Table (Needs Fixing)
```
sp_v2_chargebacks:
  - acquirer: Should be HDFC/ICICI/AXIS (bank)
  - card_network: Should be VISA/MASTERCARD/UPI (payment network) [NEW]
  - sp_transaction_id: FK to sp_v2_transactions.id [NEW]
  - txn_ref, utr, rrn (for backup matching)
```

## The Fix

### Migration Script: `fix-chargeback-schema.sql`

The migration performs these steps:

1. **Add `card_network` column** - Stores VISA/MASTERCARD/RUPAY/UPI
2. **Migrate existing data** - Move VISA/MASTERCARD from `acquirer` to `card_network`
3. **Update acquirer constraint** - Allow only bank names (HDFC, ICICI, etc.)
4. **Add `sp_transaction_id` column** - Foreign key to `sp_v2_transactions.id`
5. **Auto-link transactions** - Match via txn_ref, UTR, RRN
6. **Create correlation records** - Populate `sp_v2_chargeback_correlations`

### Data Migration Example

**Before:**
```
chargeback_id | acquirer   | txn_ref           | sp_transaction_id
------------- | ---------- | ----------------- | -----------------
abc123...     | VISA       | TXN17595063762840 | NULL
```

**After:**
```
chargeback_id | acquirer | card_network | txn_ref           | sp_transaction_id
------------- | -------- | ------------ | ----------------- | -----------------
abc123...     | HDFC     | VISA         | TXN17595063762840 | 6569
```

## How to Apply the Fix

```bash
# Run the migration script
docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 \
  -f /path/to/fix-chargeback-schema.sql

# Verify the changes
docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 \
  -c "SELECT acquirer, card_network, COUNT(*) FROM sp_v2_chargebacks GROUP BY acquirer, card_network;"
```

## Why This Matters

### Before Fix:
```sql
-- Cannot answer: Which bank has the most chargebacks?
SELECT acquirer, COUNT(*) FROM sp_v2_chargebacks GROUP BY acquirer;
-- Returns: VISA (15), MASTERCARD (10) ❌ WRONG

-- Cannot answer: What's the chargeback rate per transaction?
SELECT ... FROM sp_v2_chargebacks cb
JOIN sp_v2_transactions t ON ???  -- No FK relationship! ❌
```

### After Fix:
```sql
-- ✓ Which bank has the most chargebacks?
SELECT acquirer, COUNT(*) FROM sp_v2_chargebacks GROUP BY acquirer;
-- Returns: HDFC (15), ICICI (10), AXIS (5) ✓ CORRECT

-- ✓ Which card network has highest chargeback rate?
SELECT card_network, COUNT(*) FROM sp_v2_chargebacks GROUP BY card_network;
-- Returns: VISA (20), MASTERCARD (15), UPI (10) ✓ CORRECT

-- ✓ Chargeback rate per bank
SELECT 
  t.acquirer_code as bank,
  COUNT(DISTINCT t.id) as total_transactions,
  COUNT(DISTINCT cb.id) as chargebacks,
  ROUND(COUNT(DISTINCT cb.id)::NUMERIC / COUNT(DISTINCT t.id) * 100, 2) as chargeback_rate_pct
FROM sp_v2_transactions t
LEFT JOIN sp_v2_chargebacks cb ON cb.sp_transaction_id = t.id
GROUP BY t.acquirer_code
ORDER BY chargeback_rate_pct DESC;

-- ✓ Join transaction details with chargebacks
SELECT 
  cb.network_case_id,
  cb.acquirer as bank,
  cb.card_network,
  t.transaction_id,
  t.utr,
  t.payment_method,
  cb.chargeback_paise,
  t.amount_paise as original_amount
FROM sp_v2_chargebacks cb
JOIN sp_v2_transactions t ON cb.sp_transaction_id = t.id  -- Now possible! ✓
WHERE cb.status = 'OPEN';
```

## Database Diagram

```
┌─────────────────────────┐         ┌──────────────────────────┐
│ sp_v2_transactions      │         │ sp_v2_chargebacks        │
├─────────────────────────┤         ├──────────────────────────┤
│ id (PK)                 │◄────────│ sp_transaction_id (FK)   │ [NEW]
│ transaction_id (unique) │         │ id (PK)                  │
│ acquirer_code (HDFC)    │         │ acquirer (HDFC)          │ [FIXED]
│ payment_method (CARD)   │         │ card_network (VISA)      │ [NEW]
│ utr                     │         │ network_case_id          │
│ rrn                     │         │ txn_ref                  │
│ amount_paise            │         │ chargeback_paise         │
└─────────────────────────┘         └──────────────────────────┘
                                             │
                                             │
                                             ▼
                                    ┌──────────────────────────────┐
                                    │ sp_v2_chargeback_correlations│
                                    ├──────────────────────────────┤
                                    │ chargeback_id (FK)           │
                                    │ pg_transaction_id            │
                                    │ correlation_method           │
                                    │ confidence_score             │
                                    └──────────────────────────────┘
```

## Current Data Issues

The existing 52 chargebacks in the database have:
- **28 OPEN** chargebacks
- **15 RECOVERED** chargebacks  
- **9 WRITEOFF** chargebacks

**All have wrong acquirer values:**
- Some show "VISA" (should be a bank like HDFC)
- Some show "PHONEPE" (this is OK for UPI, but card_network should be added)

**None have transaction linkage:**
- `sp_transaction_id` doesn't exist yet
- Need to run migration to link via txn_ref/UTR/RRN matching

## Recommendation

**⚠️ IMPORTANT:** Run the migration script to fix these issues before building any chargeback analytics or reports. Otherwise:
- Chargeback analysis by bank will be impossible
- Cannot calculate true chargeback rates per acquirer
- Cannot join transaction and chargeback data for deep analysis
- Business metrics will be completely wrong
