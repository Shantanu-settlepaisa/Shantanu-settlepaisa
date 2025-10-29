# Bank Fee Tracking Implementation Session - Oct 23, 2025

**Started**: 2025-10-23
**Status**: Phase 1 & 2 Code Complete - Ready for Analytics API & Testing
**Goal**: Implement bank fee tracking end-to-end with ambiguity fix

---

## 🎯 Session Objectives

1. **Fix V1-to-V2 Mapping Ambiguity** (Phase 2 - Do First)
   - Extend `sp_v2_bank_statements` schema to preserve gross/net/fee
   - Update V1 column mapper to separate gross from net
   - Update file upload to store all three fields

2. **Track Bank Fees** (Phase 1 - Do Second)
   - Add bank charge tracking to settlement batches
   - Calculate bank fees during reconciliation
   - Aggregate bank fees in settlement calculator
   - Create analytics API endpoint

3. **Test End-to-End**
   - Upload test files (PG + Bank)
   - Run reconciliation
   - Run settlement calculation
   - Verify all database tables updated correctly
   - Test analytics API

---

## 📋 Implementation Order (Critical!)

### **PHASE 2 FIRST: Fix Ambiguity**
1. Migration 030: Extend bank_statements schema
2. Update v1-column-mapper.js
3. Update file-upload-v2.cjs
4. Test: Upload bank file, verify gross preserved

### **PHASE 1 SECOND: Track Fees**
5. Migration 031: Add columns to settlement_batches
6. Update runReconciliation.js
7. Update settlement-calculator-v1-logic.cjs
8. Add analytics endpoint
9. Test: Full recon → settlement → analytics flow

---

## 🏗️ Database Schema Changes

### Tables to Modify:

**1. sp_v2_bank_statements** (Migration 030)
```sql
ALTER TABLE sp_v2_bank_statements
ADD COLUMN gross_amount_paise BIGINT DEFAULT NULL,
ADD COLUMN bank_fee_paise BIGINT DEFAULT NULL,
ADD COLUMN bank_gst_paise BIGINT DEFAULT NULL;
```

**2. sp_v2_settlement_batches** (Migration 031)
```sql
ALTER TABLE sp_v2_settlement_batches
ADD COLUMN total_bank_charges_paise BIGINT DEFAULT 0,
ADD COLUMN settlepaisa_revenue_paise BIGINT DEFAULT 0;
```

**3. sp_v2_transactions** (No schema change)
- Populate existing `bank_fee_paise` column during reconciliation

---

## 🔧 Code Changes

### Files to Modify:

1. **db/migrations/030_extend_bank_statements_schema.sql** (NEW)
2. **db/migrations/031_add_bank_charges_tracking.sql** (NEW)
3. **services/recon-api/utils/v1-column-mapper.js** (Lines 81-95)
4. **services/api/file-upload-v2.cjs** (Bank statement insertion)
5. **services/recon-api/jobs/runReconciliation.js** (Line ~1380)
6. **services/settlement-engine/settlement-calculator-v1-logic.cjs** (Line ~370)
7. **services/overview-api/overview-v2.js** (Add new endpoint)

---

## 📊 Existing Bank Configurations (From Database)

**Total Banks**: 21 active configurations

**Key Banks with Gross/Net Distinction**:
- HDFC BANK: `"paid_amount": "DOMESTIC AMT"`, `"payee_amount": "Net Amount"`
- SBI BANK: `"paid_amount": "GROSS_AMT"`, `"payee_amount": "NET_AMT"`
- HDFC UPI: `"paid_amount": "Transaction Amount"`, `"payee_amount": "Net Amount"`
- ATOM: `"paid_amount": "Gross Txn Amount"`, `"payee_amount": "Net Amount to be Paid"`
- AMAZON: `"paid_amount": "TransactionAmount"`, `"payee_amount": "NetTransactionAmount"`

**Current Problem**: Both `paid_amount` and `payee_amount` map to `amount_paise` in V2 → Gross amount lost!

**Solution**: Map to separate columns:
- `paid_amount` → `gross_amount_paise` (NEW)
- `payee_amount` → `amount_paise` (NET, existing)

---

## 🧪 Testing Strategy

### Test Data Requirements:
1. PG transactions CSV (10 transactions, ₹10,000 each)
2. Bank statements CSV with gross/net (same 10, gross=₹10,000, net=₹9,750)

### Verification Points:

**After Phase 2 (Ambiguity Fix)**:
- [ ] `sp_v2_bank_statements.gross_amount_paise` = ₹10,000
- [ ] `sp_v2_bank_statements.amount_paise` = ₹9,750
- [ ] `sp_v2_bank_statements.bank_fee_paise` = ₹250 (if bank provides)

**After Phase 1 (Fee Tracking)**:
- [ ] `sp_v2_transactions.bank_fee_paise` = ₹250 (calculated)
- [ ] `sp_v2_transactions.settlement_amount_paise` = ₹9,750
- [ ] `sp_v2_settlement_batches.total_bank_charges_paise` = ₹2,500 (sum of 10)
- [ ] `sp_v2_settlement_batches.settlepaisa_revenue_paise` = MDR - ₹2,500

**After Analytics API**:
- [ ] GET `/api/analytics/bank-fees` returns correct aggregates
- [ ] Bank share % calculated correctly
- [ ] SettlePaisa share % calculated correctly

---

## 📝 Tables Impacted (Complete List)

### Tables with Schema Changes:
1. **sp_v2_bank_statements** (+3 columns)
2. **sp_v2_settlement_batches** (+2 columns)

### Tables with Data Updates (No Schema Change):
3. **sp_v2_transactions** (populate `bank_fee_paise` column)
4. **sp_v2_recon_matches** (indirect - references transactions)
5. **sp_v2_settlement_items** (indirect - references transactions)

### Tables Queried (Read-Only):
6. **sp_v2_bank_column_mappings** (read V1 mappings)
7. **sp_v2_merchant_configs** (read merchant settings)

---

## 🔍 Data Flow (End-to-End)

```
1. USER UPLOADS FILES
   ├─ PG Transactions CSV
   │  └─ TXN001, ₹10,000
   └─ Bank Statements CSV
      └─ TXN001, Gross=₹10,000, Net=₹9,750

2. FILE PROCESSING (file-upload-v2.cjs)
   ├─ Normalize using bank-specific mappings
   ├─ Map: "DOMESTIC AMT" → gross_amount_paise (NEW!)
   ├─ Map: "Net Amount" → amount_paise
   └─ INSERT INTO sp_v2_bank_statements
      • gross_amount_paise = 10,000 ✅
      • amount_paise = 9,750 ✅
      • bank_fee_paise = 250 (if provided) ✅

3. RECONCILIATION (runReconciliation.js)
   ├─ Match PG ↔ Bank by UTR/amount
   ├─ Calculate: bank_fee = bank_gross - bank_net
   │  └─ 10,000 - 9,750 = 250
   └─ INSERT INTO sp_v2_transactions
      • amount_paise = 10,000 (PG amount)
      • bank_fee_paise = 250 ✅
      • settlement_amount_paise = 9,750 ✅
      • status = 'RECONCILED'

4. SETTLEMENT CALCULATION (settlement-calculator-v1-logic.cjs)
   ├─ Query: SELECT SUM(bank_fee_paise) FROM sp_v2_transactions
   │  └─ Total = 2,500 (10 txns × 250)
   ├─ Calculate: settlepaisa_revenue = MDR - bank_charges
   │  └─ 3,500 - 2,500 = 1,000
   └─ INSERT INTO sp_v2_settlement_batches
      • total_bank_charges_paise = 2,500 ✅
      • settlepaisa_revenue_paise = 1,000 ✅

5. ANALYTICS API (overview-v2.js)
   ├─ Query: SELECT * FROM sp_v2_settlement_batches
   ├─ Calculate: bank_share_percent = (2500/3500) × 100 = 71%
   └─ Return: JSON with bank fees, revenue, percentages
```

---

## 🚨 Critical Checks Before Migration

### Pre-Migration Verification:
- [ ] Backup local database
- [ ] Check existing `bank_fee_paise` column in sp_v2_transactions
- [ ] Check existing `amount_paise` column in sp_v2_bank_statements
- [ ] Verify no existing `gross_amount_paise` column in sp_v2_bank_statements

### Post-Migration Verification:
- [ ] Migration 030 applied successfully
- [ ] Migration 031 applied successfully
- [ ] Indexes created
- [ ] Constraints applied
- [ ] No data loss in existing tables

---

## 🔄 Rollback Plan

### If Phase 2 Fails:
```sql
ALTER TABLE sp_v2_bank_statements
DROP COLUMN IF EXISTS gross_amount_paise,
DROP COLUMN IF EXISTS bank_fee_paise,
DROP COLUMN IF EXISTS bank_gst_paise;
```

### If Phase 1 Fails:
```sql
ALTER TABLE sp_v2_settlement_batches
DROP COLUMN IF EXISTS total_bank_charges_paise,
DROP COLUMN IF EXISTS settlepaisa_revenue_paise;
```

---

## 📅 Implementation Timeline

**Phase 2 (Ambiguity Fix)**: 3-4 hours
- Migration 030: 30 min
- Code changes: 2 hours
- Testing: 1-1.5 hours

**Phase 1 (Fee Tracking)**: 2-3 hours
- Migration 031: 30 min
- Code changes: 1 hour
- Testing: 30 min - 1 hour

**End-to-End Testing**: 1 hour

**Total**: 6-8 hours

---

## 📝 Session Notes

### Decision Points:
1. ✅ Confirmed: Do Phase 2 FIRST (ambiguity fix)
2. ✅ Confirmed: Test end-to-end locally before staging
3. ✅ Confirmed: Verify all database tables updated correctly

### Key Requirements:
- Test full flow: File upload → Recon → Settlement → Analytics
- Verify recon config mappings work correctly
- Create test CSV files with gross/net amounts
- Check all 21 bank mappings compatible

---

## 🎯 Success Criteria

### Phase 2 Success:
- [ ] Bank statements store gross, net, and fee separately
- [ ] No data loss during file upload
- [ ] All 21 bank configs work correctly

### Phase 1 Success:
- [ ] Reconciliation calculates bank fees correctly
- [ ] Settlement aggregates bank fees correctly
- [ ] Analytics API returns accurate data

### End-to-End Success:
- [ ] Upload → Recon → Settlement flow works
- [ ] All database tables updated correctly
- [ ] Bank fee = Gross - Net (verified)
- [ ] SettlePaisa revenue = MDR - Bank fees (verified)

---

## 📚 Related Documents

- BANK_FEE_TRACKING_IMPLEMENTATION.md (Original plan)
- REFUND_CHARGEBACK_STAGING_DEPLOYMENT_OCT23.md (Previous deployment)
- CLAUDE.md (Project context)
- db/migrations/015_create_bank_column_mappings.sql (Bank configs)

---

**Status**: Ready to begin implementation
**Next Step**: Create migration 030 (extend bank_statements schema)

---

## ✅ Implementation Progress

### Phase 2 (Ambiguity Fix) - COMPLETE ✅
- [x] Migration 030 created and applied
- [x] v1-column-mapper.js updated (separate gross/net mappings)
- [x] file-upload-v2.cjs updated (store all three fields)
- [x] Schema verified in database

### Phase 1 (Bank Fee Tracking) - COMPLETE ✅
- [x] Migration 031 created and applied  
- [x] runReconciliation.js updated (calculate bank fees)
- [x] settlement-calculator-v1-logic.cjs updated (aggregate fees)
- [x] Schema verified in database

### Remaining Tasks:
- [ ] Add analytics API endpoint (overview-v2.js)
- [ ] Create end-to-end test data
- [ ] Test complete flow
- [ ] Verify all database tables

---

## 🔧 Code Changes Summary

### Files Modified:
1. ✅ db/migrations/030_extend_bank_statements_schema.sql
2. ✅ db/migrations/031_add_bank_charges_tracking.sql
3. ✅ services/recon-api/utils/v1-column-mapper.js
4. ✅ services/api/file-upload-v2.cjs
5. ✅ services/recon-api/jobs/runReconciliation.js
6. ✅ services/settlement-engine/settlement-calculator-v1-logic.cjs
7. ⏳ services/overview-api/overview-v2.js (NEXT)

### Database Changes:
1. ✅ sp_v2_bank_statements: Added gross_amount_paise, bank_fee_paise, bank_gst_paise
2. ✅ sp_v2_settlement_batches: Added total_bank_charges_paise, settlepaisa_revenue_paise
3. ✅ sp_v2_transactions: Will populate bank_fee_paise, settlement_amount_paise, fee_variance_paise

---

## 📊 Expected Data Flow (After Implementation)

```
1. Upload bank statements → gross_amount_paise and amount_paise both stored
2. Run reconciliation → bank_fee calculated (PG amount - Bank net)
3. Reconciled transactions → bank_fee_paise populated
4. Run settlement → total_bank_charges_paise aggregated
5. Settlement batch → settlepaisa_revenue_paise calculated
6. Analytics API → Returns bank fee breakdown
```

