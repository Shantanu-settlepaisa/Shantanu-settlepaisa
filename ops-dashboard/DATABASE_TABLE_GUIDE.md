# Database Table Usage Guide - For AI Assistants

**Date:** October 6, 2025  
**Purpose:** Prevent confusion between `sp_v2_transactions` and `sp_v2_transactions_v1`

---

## ⚠️ CRITICAL: Two Transaction Tables Exist

We have **TWO separate transaction tables**. Using the wrong one will break features.

---

## 🎯 Decision Tree

```
Need to work with transactions?
│
├─ Is it a CSV upload? ────────────────────────► sp_v2_transactions
├─ Is it in Recon Workspace? ─────────────────► sp_v2_transactions
├─ Does it use source_type field? ────────────► sp_v2_transactions
├─ Is merchant_id a VARCHAR? ─────────────────► sp_v2_transactions
│
├─ Does it join sp_v2_settlement_items? ──────► sp_v2_transactions_v1
├─ Does it involve PG webhooks? ──────────────► sp_v2_transactions_v1
├─ Is merchant_id a UUID? ────────────────────► sp_v2_transactions_v1
└─ Does it calculate settlement amounts? ─────► sp_v2_transactions_v1
```

---

## 📊 Table Comparison

| Attribute | sp_v2_transactions | sp_v2_transactions_v1 |
|-----------|-------------------|----------------------|
| **Primary Key** | `id` BIGSERIAL | `id` UUID |
| **Merchant ID** | `merchant_id` VARCHAR(50) | `merchant_id` UUID (FK) |
| **Gateway Ref** | `gateway_ref` VARCHAR(100) | `pgw_ref` TEXT |
| **Unique Constraint** | `transaction_id` | `pgw_ref` |
| **Status Values** | PENDING, RECONCILED, EXCEPTION, FAILED | SUCCESS, FAILED, PENDING, REVERSED |
| **Has source_type?** | ✅ YES | ❌ NO |
| **Has metadata?** | ❌ NO | ✅ YES (JSONB) |
| **Has customer info?** | ❌ NO | ✅ YES (email, phone) |
| **Row Count** | ~706 rows | Unknown |

---

## 🔍 Schema Signatures (How to Identify)

### If you see these fields → `sp_v2_transactions`
```sql
- transaction_id VARCHAR(100)
- source_type VARCHAR(20)  -- 'MANUAL_UPLOAD', 'CONNECTOR'
- source_name VARCHAR(100)
- batch_id VARCHAR(100)
- status IN ('PENDING', 'RECONCILED', 'EXCEPTION', 'FAILED')
```

### If you see these fields → `sp_v2_transactions_v1`
```sql
- pgw_ref TEXT
- merchant_id UUID REFERENCES sp_v2_merchants(id)
- customer_email VARCHAR(255)
- customer_phone VARCHAR(15)
- metadata JSONB
- status IN ('SUCCESS', 'FAILED', 'PENDING', 'REVERSED')
```

---

## 🏗️ Foreign Key Dependencies

### sp_v2_transactions
- ❌ No foreign keys reference it
- Used standalone for manual uploads

### sp_v2_transactions_v1
- ✅ `sp_v2_settlement_items.txn_id` → `sp_v2_transactions_v1.id`
- Used in settlement processing pipeline

---

## 📝 Code Examples

### ✅ CORRECT: Manual Upload Query
```sql
SELECT * FROM sp_v2_transactions 
WHERE source_type = 'MANUAL_UPLOAD'
  AND transaction_date = '2025-10-05';
```

### ✅ CORRECT: Settlement Calculation
```sql
SELECT t.*, si.net_paise
FROM sp_v2_transactions_v1 t
JOIN sp_v2_settlement_items si ON t.id = si.txn_id
WHERE si.batch_id = 'some-uuid';
```

### ❌ WRONG: Don't mix them
```sql
-- This will FAIL - wrong table for settlement join
SELECT * FROM sp_v2_transactions t
JOIN sp_v2_settlement_items si ON t.id = si.txn_id;  -- Type mismatch: BIGSERIAL vs UUID
```

---

## 🚀 Service Endpoints

| API Endpoint | Table Used | Reason |
|-------------|-----------|--------|
| `POST /api/upload/multiple` | `sp_v2_transactions` | Manual CSV uploads |
| `POST /recon/run` | `sp_v2_transactions` | Reconciliation on uploaded data |
| `GET /recon/jobs/:id/results` | `sp_v2_transactions` | Recon workspace results |
| `POST /webhook/razorpay` | `sp_v2_transactions_v1` | PG webhook ingestion |
| `GET /overview/v2` | **BOTH** | Counts from v2, amounts from v1 |
| `POST /settlements/calculate` | `sp_v2_transactions_v1` | Settlement engine |

---

## 🔧 Common Mistakes to Avoid

### ❌ Mistake 1: Using v1 for file uploads
```javascript
// WRONG
const result = await pool.query(`
  INSERT INTO sp_v2_transactions_v1 (pgw_ref, amount_paise)
  VALUES ($1, $2)
`, [fileData.txnId, fileData.amount]);
```

**Fix:** Use `sp_v2_transactions` with `transaction_id` and `source_type`

### ❌ Mistake 2: Using v2 for settlements
```javascript
// WRONG
const txns = await pool.query(`
  SELECT t.* FROM sp_v2_transactions t
  JOIN sp_v2_settlement_items si ON t.id = si.txn_id
`);
```

**Fix:** Use `sp_v2_transactions_v1` (UUID FK match)

### ❌ Mistake 3: Mixing status values
```javascript
// WRONG - v2 status on v1 table
UPDATE sp_v2_transactions_v1 SET status = 'RECONCILED';

// WRONG - v1 status on v2 table
UPDATE sp_v2_transactions SET status = 'SUCCESS';
```

**Fix:** Use correct status vocabulary per table

---

## 📚 When in Doubt

1. Check which **service** you're working in (see Service-to-Table Mapping above)
2. Check if **settlement** is involved → v1
3. Check if **file upload** is involved → v2
4. Check the **foreign key** type (UUID vs BIGSERIAL)
5. Look at **existing queries** in that service

---

## ⚡ Quick Tests

Before running a query, ask:

1. ✅ Does the column exist? (`source_type` only in v2, `pgw_ref` only in v1)
2. ✅ Is the ID type correct? (integer vs UUID)
3. ✅ Are status values valid? (PENDING vs SUCCESS)
4. ✅ Does the join work? (FK type match)

---

## 🎓 Learning from Overview API

The Overview API (`overview-v2.js`) is a **perfect example** of correct usage:

```javascript
// ✅ CORRECT: Count transactions from v2
const txnCount = await client.query(`
  SELECT COUNT(*) FROM sp_v2_transactions
  WHERE status = 'RECONCILED'
`);

// ✅ CORRECT: Get settlement amounts from v1
const reconAmount = await client.query(`
  SELECT SUM(t.amount_paise)
  FROM sp_v2_recon_matches rm
  JOIN sp_v2_settlement_items si ON rm.item_id = si.id
  JOIN sp_v2_transactions_v1 t ON si.txn_id = t.id
`);
```

**Key insight:** It uses **BOTH tables** because they serve different purposes!

---

## 📞 If You Break Something

If you accidentally use the wrong table:

1. Check error messages for type mismatches (`uuid` vs `bigint`)
2. Check for missing columns (`source_type`, `pgw_ref`)
3. Check for invalid status values
4. Review this guide's Decision Tree
5. Look at similar working code in the same service

---

## 🔮 Future: Don't Merge Without Planning

These tables **cannot** be easily merged due to:
- Incompatible ID types (BIGSERIAL vs UUID)
- Different foreign key constraints
- Different status vocabularies
- 40-60 hours of migration work estimated

**If merge is needed:** Create a detailed migration plan first.

---

**Last Updated:** October 6, 2025  
**Maintained By:** Development Team + AI Context
