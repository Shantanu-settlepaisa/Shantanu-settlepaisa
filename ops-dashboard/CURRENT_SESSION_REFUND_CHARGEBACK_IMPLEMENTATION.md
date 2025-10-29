# Current Session: Refund & Chargeback Upload Implementation

**Date**: 2025-10-22
**Session Goal**: Build and test refund/chargeback CSV upload functionality on local
**Target URL**: http://localhost:5174/ops/overview

---

## 📋 Session Context

### What We're Building:
1. **Refund CSV Upload** → Updates sp_v2_transactions with refund columns
2. **Chargeback CSV Upload** → Inserts into sp_v2_chargebacks table
3. **Settlement Calculator** → Deducts both from gross amount
4. **Web UI** → Add upload functionality to /ops/overview page

### Hybrid Approach:
- **Phase 1 (NOW)**: Manual CSV upload by ops team
- **Phase 2 (FUTURE)**: Automatic webhooks from payment gateways

---

## 📊 CSV Schemas Confirmed

### Refunds CSV Format:
```csv
transaction_id,refund_amount,refund_type
TXN12345,500000,refund
TXN67890,300000,chargeback
```

### Chargebacks CSV Format:
```csv
transaction_id,merchant_id,chargeback_amount,reason_code,status
TXN12345,MERCH001,200000,FRAUD_CARD_NOT_PRESENT,LOST
TXN67890,MERCH001,150000,AUTHORIZATION_ISSUE,OPEN
```

**Important**: All amounts in **PAISE** (₹1 = 100 paise)

---

## 🎯 Implementation Plan

### Step 1: Database Migration ✅
- Add refund columns to sp_v2_transactions
- Run on local database (localhost:5433)

### Step 2: Backend APIs
- Create `/api/refunds/upload` endpoint
- Create `/api/chargebacks/upload` endpoint
- Port: 5109 (existing upload API service)

### Step 3: Web UI Updates
- Modify /ops/overview page (OverviewSimple.tsx)
- Add upload buttons/modals for refunds and chargebacks
- Reuse existing upload components

### Step 4: Settlement Calculator
- Update settlement-calculator-v1-logic.cjs
- Add refund deduction query
- Add chargeback deduction query

### Step 5: Testing
- Create test CSV files
- Upload via UI
- Verify database updates
- Test settlement calculation with deductions

---

## 🔧 Technical Details

### Database Changes Needed:
```sql
-- sp_v2_transactions (ADD columns)
ALTER TABLE sp_v2_transactions
ADD COLUMN refund_amount_paise BIGINT,
ADD COLUMN refund_type VARCHAR,
ADD COLUMN refund_date TIMESTAMPTZ,
ADD COLUMN is_refund_processed BOOLEAN DEFAULT FALSE;

-- sp_v2_chargebacks (NO changes - already exists)
```

### Backend Processing:
- **Refunds**: UPDATE existing transaction rows
- **Chargebacks**: INSERT new chargeback rows

### Frontend Location:
- Page: src/pages/ops/OverviewSimple.tsx
- URL: http://localhost:5174/ops/overview
- Components to reuse: ManualUploadEnhanced.tsx, UploadFileModal.tsx

---

## 📝 Session Progress

### Completed:
- ✅ Analyzed V1 refund/chargeback mechanism
- ✅ Verified V1 database structure
- ✅ Verified V2 database structure
- ✅ Analyzed CSV schemas needed
- ✅ Created complete analysis document

### In Progress:
- 🔄 Creating database migration
- 🔄 Building refund upload API
- 🔄 Building chargeback upload API
- 🔄 Adding UI to overview page

### Pending:
- ⏳ Testing refund upload
- ⏳ Testing chargeback upload
- ⏳ Updating settlement calculator
- ⏳ End-to-end testing

---

## 🚀 Next Actions

1. Create migration file
2. Run migration on local DB
3. Create refund upload API
4. Create chargeback upload API
5. Add upload UI to overview page
6. Create test CSV files
7. Test complete flow

---

**Session Start**: 2025-10-22
**Expected Duration**: 2-3 hours
**Test Environment**: Local (localhost:5433, localhost:5174)
