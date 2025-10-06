# Schema Mismatch Analysis: sp_v2_transactions vs sp_v2_transactions_v1

## 🚨 Critical Incompatibilities

### 1. **Primary Key Type Mismatch** ❌
- `sp_v2_transactions.id` → **BIGINT** (auto-increment)
- `sp_v2_transactions_v1.id` → **UUID** (random)
- **Impact:** Cannot directly copy IDs

### 2. **Merchant ID Type Mismatch** ❌  
- `sp_v2_transactions.merchant_id` → **VARCHAR** (string like "MERCH001")
- `sp_v2_transactions_v1.merchant_id` → **UUID** (550e8400-e29b-41d4-a716-446655440001)
- **Impact:** Need UUID → VARCHAR conversion

### 3. **Transaction Identifier Mismatch** ⚠️
- `sp_v2_transactions.transaction_id` → **VARCHAR** (business key, unique)
- `sp_v2_transactions_v1.pgw_ref` → **TEXT** (gateway reference)
- **Mapping:** pgw_ref → transaction_id (this works ✅)

### 4. **Required Fields Missing** ❌

#### sp_v2_transactions REQUIRES (NOT NULL):
- `transaction_date` (DATE) - v1 only has `created_at` (TIMESTAMP)
- `transaction_timestamp` (TIMESTAMP) - can map from v1.created_at ✅
- `source_type` (VARCHAR) - v1 doesn't have (need to add 'WEBHOOK')

#### sp_v2_transactions_v1 REQUIRES:
- `pgw_ref` (TEXT) - v2 doesn't have exact equivalent

### 5. **Column Name Differences** ⚠️
| sp_v2_transactions | sp_v2_transactions_v1 | Mapping |
|--------------------|----------------------|---------|
| payment_method | payment_mode | ✅ Rename |
| gateway_ref | pgw_ref | ✅ Copy |
| - | customer_email | ❌ v2 doesn't have |
| - | customer_phone | ❌ v2 doesn't have |
| - | metadata (JSONB) | ❌ v2 doesn't have |

### 6. **Extra Columns in v2** ℹ️
These exist in v2 but not v1 (nullable, so OK to leave empty):
- settlement_batch_id
- settled_at  
- bank_fee_paise
- settlement_amount_paise
- fee_variance_paise
- acquirer_code
- merchant_name
- card_network
- exception_reason

---

## ✅ What CAN Be Mapped

| v1 Column | v2 Column | Transformation |
|-----------|-----------|----------------|
| pgw_ref | transaction_id | Direct copy |
| merchant_id (UUID) | merchant_id (VARCHAR) | Cast to text: `merchant_id::text` |
| amount_paise | amount_paise | Direct copy |
| utr | utr | Direct copy |
| payment_mode | payment_method | Direct copy |
| status | status | Direct copy |
| currency (CHAR) | currency (VARCHAR) | Direct copy |
| created_at | transaction_timestamp | Direct copy |
| created_at | transaction_date | Extract date: `created_at::date` |
| - | source_type | Hardcode: 'WEBHOOK' |

---

## ❌ What CANNOT Be Mapped

1. **Customer data lost:**
   - customer_email, customer_phone, metadata → No columns in v2
   - **Solution:** Keep in v1, reference via join if needed

2. **Merchant UUID lost:**
   - v1 merchant_id is UUID, v2 expects string
   - **Solution:** Need merchant UUID → merchant_code mapping table

---

## 🔧 Migration Strategy (Safe Approach)

### Option 1: Lossy Migration (Acceptable for Settlement)
```sql
INSERT INTO sp_v2_transactions 
(transaction_id, merchant_id, amount_paise, utr, payment_method, 
 status, transaction_date, transaction_timestamp, source_type, gateway_ref)
SELECT 
  pgw_ref,                          -- Use gateway ref as transaction_id
  merchant_id::text,                -- Cast UUID to VARCHAR
  amount_paise,
  utr,
  payment_mode,
  status,
  created_at::date,                 -- Extract date from timestamp
  created_at,                       -- Use created_at as timestamp
  'WEBHOOK',                        -- Mark source as webhook
  pgw_ref                           -- Copy to gateway_ref too
FROM sp_v2_transactions_v1
WHERE status = 'SUCCESS'            -- Only migrate successful transactions
ON CONFLICT (transaction_id) DO NOTHING;
```

**What's Lost:**
- customer_email, customer_phone (not needed for settlement)
- metadata JSONB (can keep in v1 for reference)

**What's Gained:**
- 376 webhook transactions become settleable
- Unified reporting
- Single settlement pipeline

### Option 2: Add Missing Columns to v2 (Future-proof)
```sql
-- Extend sp_v2_transactions to match v1 capabilities
ALTER TABLE sp_v2_transactions
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Now migration is lossless
INSERT INTO sp_v2_transactions 
(transaction_id, merchant_id, amount_paise, utr, payment_method, 
 status, transaction_date, transaction_timestamp, source_type, 
 customer_email, customer_phone, metadata, gateway_ref)
SELECT 
  pgw_ref,
  merchant_id::text,
  amount_paise,
  utr,
  payment_mode,
  status,
  created_at::date,
  created_at,
  'WEBHOOK',
  customer_email,
  customer_phone,
  metadata,
  pgw_ref
FROM sp_v2_transactions_v1
ON CONFLICT (transaction_id) DO NOTHING;
```

---

## 🎯 Recommended Approach

**For Settlement (What you need NOW):**
- Use **Option 1** (lossy migration)
- Customer data stays in v1 (not needed for settlement)
- Only SUCCESS status transactions migrate
- 376 rows become settleable immediately

**For Future Webhook Ingestion:**
```javascript
// In webhook handler, write to BOTH tables:
// 1. Write to v1 (preserve customer data)
await pool.query('INSERT INTO sp_v2_transactions_v1 ...');

// 2. Write to v2 (make settleable)
await pool.query(`
  INSERT INTO sp_v2_transactions 
  (transaction_id, merchant_id, amount_paise, utr, 
   payment_method, status, transaction_date, 
   transaction_timestamp, source_type, gateway_ref)
  VALUES ($1, $2::text, $3, $4, $5, $6, $7, $8, 'WEBHOOK', $1)
`);
```

---

## 🚦 Migration Safety Checklist

- [ ] Merchant UUID → merchant_id string mapping verified
- [ ] Only SUCCESS transactions migrate (no FAILED/PENDING)
- [ ] Existing 706 manual upload rows unaffected
- [ ] FK constraint allows new webhook settlements
- [ ] Reports query updated to handle source_type='WEBHOOK'
- [ ] Backup v1 table before migration

---

## 💡 Key Insight

The schema mismatch is **manageable** because:
1. Settlement only needs: transaction_id, merchant_id, amount, status
2. Customer data (email, phone) NOT required for settlement calculations
3. Type conversions (UUID→VARCHAR) are safe with casting
4. Missing columns in v2 are all nullable (can be NULL)

**Bottom line:** Migration IS possible, but with controlled data loss (customer fields). For settlement purposes, this is acceptable.
