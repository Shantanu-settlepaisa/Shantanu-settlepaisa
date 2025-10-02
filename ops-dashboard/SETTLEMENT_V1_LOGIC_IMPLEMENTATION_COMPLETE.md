# ✅ Settlement Calculation with V1 Logic - COMPLETE

**Implementation Date:** October 1, 2025  
**Status:** READY FOR TESTING  
**Timeline:** Completed in 4 hours

---

## 🎯 What Was Built

### 1. **SabPaisa Connector Service** ✅
**Location:** `/services/sabpaisa-connector/`  
**Port:** 5114  
**Purpose:** Direct connection to SabPaisa staging database

**Features:**
- ✅ Connects to SabPaisa DB (`3.108.237.99:5432/settlepaisa`)
- ✅ Fetches PG transactions from `transactions_to_settle` table
- ✅ Fetches merchant configs from `merchant_data` table (15,403 merchants)
- ✅ Fetches fee bearer configs from `merchant_fee_bearer` table (91,884 records)
- ✅ Fetches MDR rates from `merchant_base_rate` table (318,480 records)
- ✅ REST API endpoints for V2 to query

**Endpoints:**
```bash
GET http://localhost:5114/health
GET http://localhost:5114/api/transactions?date=2025-09-30
GET http://localhost:5114/api/merchants?status=Approved
GET http://localhost:5114/api/fee-bearer/:clientCode
```

**Test:**
```bash
curl http://localhost:5114/health
# Returns: {"status":"healthy", "statistics":{"merchants":"15403"}}
```

---

### 2. **Settlement Calculator with V1 Exact Logic** ✅
**Location:** `/services/settlement-engine/settlement-calculator-v1-logic.cjs`  
**Purpose:** Calculate settlements using V1's exact formula

**V1 Logic Implemented:**

#### **Fee Bearer Logic** (Exactly like V1)
```javascript
Fee Bearer ID 1 (Bank)       → Settlement = Paid Amount (no deduction)
Fee Bearer ID 2 (Merchant)   → Settlement = Paid Amount - PG Charges
Fee Bearer ID 3 (Payer)      → Settlement = Payee Amount (customer paid fees)
Fee Bearer ID 4 (Subscriber) → Settlement = Paid Amount (subscription model)
```

#### **Charge Calculation** (V1 Formula)
```javascript
// Conv Charges (from merchant_base_rate)
if (convchargestype === 'percentage') {
  convCharges = (amount * convcharges) / 100
} else {
  convCharges = convcharges // fixed amount
}

// Endpoint Charges
if (endpointchargestypes === 'percentage') {
  epCharges = (amount * endpointcharge) / 100
} else {
  epCharges = endpointcharge // fixed amount
}

// GST
if (gsttype === 'percentage') {
  gst = ((convCharges + epCharges) * gst) / 100
} else {
  gst = fixed_gst_amount
}

// Total PG Charge
pgCharge = convCharges + epCharges + gst
```

#### **Rolling Reserve** (V1 Logic)
```javascript
// From merchant_data table
if (merchant.rolling_reserve === true) {
  reserveAmount = (settlementAmount * rolling_percentage) / 100
  releaseDate = cycleDate + no_of_days // e.g., 30 days hold
}

finalSettlement = settlementAmount - reserveAmount
```

**Data Sources (All from SabPaisa DB):**
- ✅ `merchant_data` - Rolling reserve config, subscription
- ✅ `merchant_fee_bearer` - Fee bearer per merchant/payment mode
- ✅ `merchant_base_rate` - MDR rates (conv charges, EP charges, GST)
- ✅ `fee_bearer` - Fee bearer type lookup (Bank/Merchant/Payer/Subscriber)
- ✅ `payment_mode` - Payment mode lookup

---

### 3. **V2 Database Tables** ✅
**Migration:** `db/migrations/007_settlement_tables_v1_logic.sql`  
**Database:** `settlepaisa_v2` (Port 5433)

**Tables Created:**
```sql
sp_v2_settlement_batches          -- Settlement batch summary
sp_v2_settlement_items             -- Individual transaction breakdowns
sp_v2_rolling_reserve_ledger       -- Reserve hold/release tracking
sp_v2_settlement_bank_transfers    -- Payout tracking
sp_v2_commission_tiers             -- Future volume-based pricing
```

**Schema:**
```sql
sp_v2_settlement_batches:
  - id (UUID)
  - merchant_id (VARCHAR)
  - merchant_name (VARCHAR)
  - cycle_date (DATE)
  - total_transactions (INTEGER)
  - gross_amount_paise (BIGINT)
  - total_commission_paise (BIGINT)
  - total_gst_paise (BIGINT)
  - total_reserve_paise (BIGINT)
  - net_amount_paise (BIGINT)
  - status (VARCHAR) -- PENDING_APPROVAL, APPROVED, PAID
  
sp_v2_settlement_items:
  - settlement_batch_id (UUID FK)
  - transaction_id (VARCHAR)
  - amount_paise (BIGINT)
  - commission_paise (BIGINT)
  - gst_paise (BIGINT)
  - reserve_paise (BIGINT)
  - net_paise (BIGINT)
  - payment_mode (VARCHAR)
  - fee_bearer (VARCHAR)
```

---

### 4. **Recon → Settlement Integration** ✅
**File:** `/services/recon-api/jobs/runReconciliation.js` (lines 252-307)

**Flow:**
```
1. Recon job completes successfully
2. Check if there are matched transactions (job.counters.matched > 0)
3. Group matched transactions by merchant_id
4. For each merchant:
   a. Fetch merchant config from SabPaisa DB
   b. Fetch fee bearer config from SabPaisa DB
   c. Fetch MDR rates from SabPaisa DB
   d. Calculate settlement using V1 logic
   e. Store in sp_v2_settlement_batches + sp_v2_settlement_items
5. Log settlement batch IDs
6. Settlement data now available in Reports section
```

**Automatic Trigger:**
- ✅ Runs automatically after every successful reconciliation
- ✅ Only processes MATCHED transactions
- ✅ Groups by merchant for batch settlement
- ✅ Non-blocking: If settlement fails, recon job still succeeds

---

## 📊 How It Works - Complete Flow

### **End-to-End Settlement Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Transaction Data Exists in SabPaisa DB             │
│  (transactions_to_settle table)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: V2 Runs Reconciliation                             │
│  - Fetches PG data via SabPaisa Connector                   │
│  - Matches with bank statements                             │
│  - Creates MATCHED transactions                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Auto-Trigger Settlement (NEW)                      │
│  - Groups matched txns by merchant                          │
│  - For each merchant:                                       │
│    1. Query SabPaisa for fee bearer config                  │
│    2. Query SabPaisa for MDR rates                          │
│    3. Query SabPaisa for rolling reserve %                  │
│    4. Calculate settlement (V1 logic)                       │
│    5. Store in V2 database                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: V2 Reports Auto-Populate                           │
│  - Settlement batches stored in sp_v2_settlement_batches    │
│  - Reports section reads from V2 tables                     │
│  - Merchant-wise settlement reports available               │
│  - Export to Excel/CSV                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing Instructions

### **Prerequisites:**
1. SabPaisa Connector running on port 5114
2. V2 Recon API running on port 5103
3. V2 database (settlepaisa_v2) has settlement tables

### **Option 1: Test with Existing Merchant Data**

Since SabPaisa staging DB has **NO transaction data** but has **15,403 merchants**, you need to either:

**A. Use Production Data** (if available)
```bash
# Connect to production SabPaisa DB (if you have access)
# Update sabpaisa-connector config to point to production
```

**B. Insert Test Transactions** (recommended)
```sql
-- Insert test transaction in SabPaisa staging
INSERT INTO transactions_to_settle (
  transaction_id, client_code, paid_amount, payee_amount,
  payment_mode, transaction_status, trans_complete_date,
  convcharges, ep_charges, gst, paymode_id
) VALUES (
  'TEST_TXN_001',
  'UNIV99', -- University of Jammu (exists in merchant_data)
  10000, -- ₹100
  10000,
  'Net Banking',
  'SUCCESS',
  '2025-10-01',
  0,
  200, -- 2% EP charge
  36,  -- 18% GST on EP charge
  3    -- Net Banking paymode_id
);

-- Insert matching bank statement
INSERT INTO transaction_bank (
  transaction_id, bank_name, utr, amount,
  transaction_date, status
) VALUES (
  'TEST_TXN_001',
  'SBI',
  'UTR1234567890',
  10000,
  '2025-10-01',
  'SUCCESS'
);
```

**C. Test with V2 Manual Upload** (easiest)
```bash
# 1. Create test PG CSV
echo "transaction_id,merchant_id,amount,payment_mode,status,utr,created_at
TEST001,UNIV99,10000,Net Banking,SUCCESS,UTR123,2025-10-01" > test_pg.csv

# 2. Create test Bank CSV
echo "utr,amount,transaction_date,bank_name
UTR123,10000,2025-10-01,SBI" > test_bank.csv

# 3. Upload via V2 UI
# - Go to http://localhost:5174/ops/overview
# - Upload test_pg.csv and test_bank.csv
# - Run reconciliation
```

### **Option 2: Verify Settlement Logic**

Test settlement calculator directly:
```bash
node -e "
const { SettlementCalculatorV1Logic } = require('./services/settlement-engine/settlement-calculator-v1-logic.cjs');

(async () => {
  const calc = new SettlementCalculatorV1Logic();
  
  const testTransactions = [{
    transaction_id: 'TEST001',
    paid_amount: 10000, // ₹100
    payee_amount: 10000,
    payment_mode: 'Net Banking',
    paymode_id: 3
  }];
  
  const settlement = await calc.calculateSettlement(
    'UNIV99', // University of Jammu
    testTransactions,
    '2025-10-01'
  );
  
  console.log('Settlement Calculation:');
  console.log(JSON.stringify(settlement, null, 2));
  
  await calc.close();
})();
"
```

---

## 📈 Expected Settlement Calculation Example

**For University of Jammu (UNIV99):**

### Input:
- Transaction Amount: ₹10,000
- Payment Mode: Net Banking
- Fee Bearer: Merchant (ID 2)
- Conv Charges: 0%
- EP Charges: 2%
- GST: 18%
- Rolling Reserve: 0% (no reserve for this merchant)

### Calculation:
```
Gross Amount:      ₹10,000.00
Conv Charges:      ₹0.00       (0%)
EP Charges:        ₹200.00     (2%)
GST:               ₹36.00      (18% of charges)
─────────────────────────────────
Total PG Charge:   ₹236.00

Fee Bearer: Merchant → Deduct from merchant
Settlement:        ₹10,000.00 - ₹236.00 = ₹9,764.00
Rolling Reserve:   ₹0.00       (0%)
─────────────────────────────────
Net Settlement:    ₹9,764.00
```

### Stored in V2:
```sql
sp_v2_settlement_batches:
  merchant_id: 'UNIV99'
  gross_amount_paise: 1000000
  total_commission_paise: 20000
  total_gst_paise: 3600
  total_reserve_paise: 0
  net_amount_paise: 976400

sp_v2_settlement_items:
  transaction_id: 'TEST001'
  amount_paise: 1000000
  commission_paise: 20000
  gst_paise: 3600
  net_paise: 976400
  fee_bearer: 'merchant'
```

---

## 🚀 Next Steps to Complete

### **CRITICAL: Get Test Data**

**Current Blocker:** SabPaisa staging DB is empty (0 transactions)

**Options to Proceed:**

1. **Insert Test Transactions** (15 min)
   ```bash
   # Run SQL script to insert 10-20 test transactions
   # Use existing merchants (UNIV99, MURA86, NISP83, etc.)
   # Cover different payment modes (UPI, Cards, NetBanking)
   # Cover different fee bearers (Bank, Merchant, Payer)
   ```

2. **Connect to Production Data** (if available)
   ```bash
   # Update SabPaisa Connector to production DB
   # Test with real historical data
   ```

3. **Use V2 Manual Upload**
   ```bash
   # Create CSV files with test data
   # Upload via V2 UI
   # Verify settlement calculation
   ```

### **Testing Checklist:**

- [ ] Insert test transactions in SabPaisa staging
- [ ] Run V2 reconciliation
- [ ] Verify settlement auto-triggers
- [ ] Check `sp_v2_settlement_batches` table for results
- [ ] Verify calculations match V1 logic
- [ ] Test settlement reports in V2 UI
- [ ] Export to Excel/CSV
- [ ] Compare with V1 sample reports

---

## 📝 Summary

### ✅ **What's Complete:**
1. ✅ SabPaisa Connector (direct DB access)
2. ✅ Settlement Calculator (V1 exact logic)
3. ✅ V2 Database Tables (settlement storage)
4. ✅ Recon → Settlement Integration (auto-trigger)
5. ✅ Reports foundation (reads from V2 tables)

### ⏳ **What's Pending:**
1. ⏳ Test data creation (SabPaisa staging is empty)
2. ⏳ End-to-end testing with real/test data
3. ⏳ Settlement report UI verification
4. ⏳ Validation against V1 sample reports

### 🎯 **To Test Today:**
```bash
# 1. Start services
cd /Users/shantanusingh/ops-dashboard
./start-services.sh

# 2. Verify SabPaisa Connector
curl http://localhost:5114/health

# 3. Create test data (choose one method above)

# 4. Run reconciliation via V2 UI
# - Upload PG CSV + Bank CSV
# - Click "Run Reconciliation"
# - Check logs for settlement trigger

# 5. Query settlement results
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost', port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres', password: 'settlepaisa123'
});
(async () => {
  const result = await pool.query('SELECT * FROM sp_v2_settlement_batches');
  console.table(result.rows);
  await pool.end();
})();
"
```

---

## 🔍 Troubleshooting

### Issue: Settlement not triggering
**Check:**
```bash
# 1. Verify recon completed successfully
curl http://localhost:5103/api/jobs/:jobId

# 2. Check settlement logs
tail -f /tmp/recon-api.log | grep -i settlement

# 3. Verify matched transactions exist
# Settlement only triggers if job.counters.matched > 0
```

### Issue: Settlement calculation errors
**Check:**
```bash
# 1. Verify SabPaisa connector is running
curl http://localhost:5114/health

# 2. Check merchant exists
curl "http://localhost:5114/api/merchants?search=UNIV99"

# 3. Verify fee bearer config exists
curl "http://localhost:5114/api/fee-bearer/UNIV99"
```

---

**Implementation Status:** ✅ READY FOR TESTING  
**Estimated Test Time:** 1-2 hours (with test data)  
**Blockers:** Need transaction data in SabPaisa staging DB
