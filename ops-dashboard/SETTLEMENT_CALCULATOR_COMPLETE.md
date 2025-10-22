# ✅ Settlement Calculator with Refunds & Chargebacks - COMPLETE!

**Date**: 2025-10-22
**Status**: ✅ IMPLEMENTED
**Database**: localhost:5433/settlepaisa_v2

---

## 🎯 What Was Built

### 1. Database Schema Updates ✅

**Migration 028**: `db/migrations/028_add_settlement_tracking.sql`

**Changes**:
- ✅ Added `is_settlement_processed` column to `sp_v2_chargebacks`
- ✅ Created `sp_v2_merchant_outstanding_debts` table for negative balance tracking
- ✅ Added deduction tracking columns to `sp_v2_settlements`:
  - `refund_deductions_paise`
  - `chargeback_deductions_paise`
  - `outstanding_debt_recovered_paise`
- ✅ Created indexes for efficient querying

**Result**: Database schema ready for tracking refunds/chargebacks in settlements

---

### 2. Settlement Calculator Logic ✅

**File**: `services/settlement-engine/settlement-calculator-with-deductions.cjs`
**Size**: ~600 lines
**Status**: ✅ COMPLETE

**Core Functions**:

#### `calculateMerchantSettlement(merchantId, cycleDate)`
Main calculation function that:
- Gets all reconciled transactions for the cycle
- Calculates gross amount
- Calculates fees (platform + gateway)
- **Deducts same-cycle refunds**
- **Deducts cross-cycle refunds (outstanding)**
- **Deducts LOST chargebacks**
- Recovers outstanding debts from previous cycles
- Protects against negative balances
- Returns comprehensive breakdown

#### `calculateRefundDeductions(merchantId, cycleDate, transactions)`
Handles refund logic:
- **Same-cycle refunds**: Refunds for transactions in current settlement
- **Cross-cycle refunds**: Refunds for transactions already settled previously
- Separates current vs outstanding for transparency
- Returns detailed breakdown with transaction IDs

#### `calculateChargebackDeductions(merchantId)`
Handles chargeback logic:
- Only deducts LOST chargebacks (outcome='LOST', status='WRITEOFF')
- Ignores OPEN (pending investigation)
- Ignores WON (merchant won dispute)
- Returns detailed breakdown

#### `createOutstandingDebt(merchantId, debtAmount, cycleDate, breakdown)`
Negative balance protection:
- Creates debt record when refunds/chargebacks > new sales
- Stores breakdown in JSON for transparency
- Debt automatically recovered from future settlements
- Prevents merchant from going into actual negative balance

#### `completeSettlementProcessing(settlementResult, settlementBatchId)`
Marks items as processed:
- Sets `is_refund_processed = TRUE` on refunded transactions
- Sets `is_settlement_processed = TRUE` on chargebacks
- Marks outstanding debts as recovered
- Prevents double-deduction

---

## 💡 How It Works

### Scenario 1: Clean Settlement (No Refunds)
```
Input:
  - Merchant: ABC Store
  - Cycle: Oct 21, 2025
  - Transactions: 10 txns, ₹50,000

Calculation:
  Gross Amount:        ₹50,000
  Platform Fee (2%):   -₹1,000
  Gateway Fee (1.5%):  -₹750
  Refunds:             ₹0
  Chargebacks:         ₹0
  ─────────────────────────────
  Net Payout:          ₹48,250

Status: READY_FOR_PAYOUT
```

---

### Scenario 2: Same-Cycle Refund
```
Input:
  - Transactions: ₹50,000
  - Refund issued: ₹5,000 (on Oct 23, before settlement)

Calculation:
  Gross Amount:        ₹50,000
  Fees:                -₹1,750
  Refund (current):    -₹5,000  ← Deducted!
  ─────────────────────────────
  Net Payout:          ₹43,250

Status: READY_FOR_PAYOUT
Action: Mark refund as processed
```

**Result**: Merchant never receives money for refunded transaction

---

### Scenario 3: Cross-Cycle Refund (Complex!)
```
Sep 21: Transaction ₹10,000
Sep 30: Settlement → Merchant paid ₹10,000 ✅
Oct 3: Customer requests refund ₹10,000 ⚠️

Oct 7 Settlement:
  New transactions:     ₹30,000
  Fees:                 -₹1,050
  Refund (outstanding): -₹10,000  ← From previous cycle!
  ─────────────────────────────
  Net Payout:           ₹18,950

Status: READY_FOR_PAYOUT
Breakdown shows: "Refund from Sep 21 transaction (settled Sep 30)"
```

**Result**: Outstanding refund automatically deducted from next settlement

---

### Scenario 4: Chargeback Deduction
```
Cycle: ₹50,000 in new sales
Chargeback: ₹8,000 (FRAUD, LOST)

Calculation:
  Gross Amount:        ₹50,000
  Fees:                -₹1,750
  Chargeback (LOST):   -₹8,000  ← Deducted!
  ─────────────────────────────
  Net Payout:          ₹40,250

Status: READY_FOR_PAYOUT
```

---

### Scenario 5: Negative Settlement (Debt Protection)
```
New sales: ₹3,000
Old refunds: ₹10,000
Chargebacks: ₹5,000

Calculation:
  Gross:               ₹3,000
  Fees:                -₹105
  Refunds:             -₹10,000
  Chargebacks:         -₹5,000
  ─────────────────────────────
  Net (before protection): -₹12,105  ⚠️ NEGATIVE!

Protection:
  Payout:              ₹0  ← Don't pay negative!
  Outstanding Debt:    ₹12,105  ← Track as debt

Status: NEGATIVE_BALANCE
Action: Create debt record in sp_v2_merchant_outstanding_debts

Next Settlement (Oct 14):
  New sales:           ₹30,000
  Fees:                -₹1,050
  Outstanding debt:    -₹12,105  ← Recovered!
  ─────────────────────────────
  Net Payout:          ₹16,845

Status: READY_FOR_PAYOUT
Debt cleared! ✅
```

---

## 📊 Database Flow

### Tables Involved:

**1. `sp_v2_transactions`** - Transaction data
- Has refund columns: `refund_amount_paise`, `refund_type`, `refund_date`
- Flag: `is_refund_processed` (FALSE → TRUE after settlement)

**2. `sp_v2_chargebacks`** - Chargeback tracking
- Filter: `outcome='LOST'` AND `status='WRITEOFF'`
- Flag: `is_settlement_processed` (FALSE → TRUE after settlement)

**3. `sp_v2_merchant_outstanding_debts`** - Negative balance tracking
- Created when: net settlement < 0
- Status: OUTSTANDING → FULLY_RECOVERED
- Auto-recovered from future settlements

**4. `sp_v2_settlements`** - Settlement batches
- Now tracks: `refund_deductions_paise`, `chargeback_deductions_paise`
- Transparency: Shows what was deducted

**5. `sp_v2_settlement_items`** - Individual transaction settlements
- Links transactions to settlement batches
- Used to detect cross-cycle refunds

---

## 🔄 Complete User Journey

### Step 1: Upload Refunds/Chargebacks
```
Ops Team Actions:
1. Go to /ops/recon
2. Click "Upload Refunds" → Upload CSV
3. Click "Upload Chargebacks" → Upload CSV

Database:
- sp_v2_transactions.refund_amount_paise = X
- sp_v2_transactions.is_refund_processed = FALSE
- sp_v2_chargebacks row inserted with is_settlement_processed = FALSE
```

### Step 2: Settlement Calculator Runs
```
When: Daily/Weekly settlement cycle

Process:
1. Call calculateMerchantSettlement(merchantId, cycleDate)
2. Calculator queries:
   - All reconciled transactions (gross amount)
   - Refunds with is_refund_processed = FALSE
   - Chargebacks with is_settlement_processed = FALSE
   - Outstanding debts with status = OUTSTANDING
3. Calculates net amount
4. If negative → Create debt record, pay ₹0
5. Returns complete breakdown

Result:
{
  grossAmount: 5000000,  // ₹50,000
  fees: { total: 175000 },
  deductions: {
    refunds: { total: 500000, currentCycle: 300000, outstanding: 200000 },
    chargebacks: { total: 800000 },
    outstandingDebt: { total: 0 }
  },
  netAmount: 3525000,  // ₹35,250
  status: 'READY_FOR_PAYOUT'
}
```

### Step 3: Settlement Approval & Payout
```
Ops Team Reviews:
- Sees gross amount
- Sees all deductions (refunds, chargebacks, debts)
- Sees net payout amount

Approves → Payout initiated

Post-Payout:
- Call completeSettlementProcessing()
- Marks refunds as processed
- Marks chargebacks as processed
- Marks debts as recovered
```

---

## 🎯 API Response Format

```javascript
{
  "merchantId": "MERCH_ABC",
  "cycleDate": "2025-10-21",
  "status": "READY_FOR_PAYOUT",

  "grossAmount": 5000000,  // ₹50,000
  "transactionCount": 15,

  "fees": {
    "platformFee": 100000,  // ₹1,000
    "gatewayFee": 75000,    // ₹750
    "total": 175000
  },

  "deductions": {
    "refunds": {
      "currentCycle": 300000,    // ₹3,000
      "outstanding": 200000,     // ₹2,000
      "total": 500000,           // ₹5,000
      "count": 3,
      "details": {
        "currentCycleRefunds": [
          { "transactionId": "TXN001", "amount": 200000, "type": "refund" }
        ],
        "outstandingRefunds": [
          {
            "transactionId": "TXN_OLD",
            "amount": 200000,
            "originalBatchId": "BATCH_001",
            "originalSettlementDate": "2025-10-14"
          }
        ]
      }
    },
    "chargebacks": {
      "total": 800000,  // ₹8,000
      "count": 1,
      "details": [
        {
          "transactionId": "TXN003",
          "amount": 800000,
          "reason": "FRAUD",
          "outcome": "LOST"
        }
      ]
    },
    "outstandingDebt": {
      "total": 0,
      "count": 0,
      "details": []
    }
  },

  "netAmount": 3525000,    // ₹35,250
  "payoutAmount": 3525000,

  "breakdown": {
    "grossAmount": 5000000,
    "platformFee": 100000,
    "gatewayFee": 75000,
    "refundDeductions": 500000,
    "chargebackDeductions": 800000,
    "outstandingDebtRecovered": 0,
    "netAmount": 3525000
  }
}
```

---

## 🧪 Testing

**Test File**: `test-settlement-with-refunds.cjs`

**Scenarios Covered**:
1. ✅ Clean settlement (no deductions)
2. ✅ Same-cycle refund
3. ✅ Cross-cycle refund
4. ✅ Chargeback deduction
5. ✅ Negative settlement with debt tracking

**To Run Tests**:
```bash
node test-settlement-with-refunds.cjs
```

---

## 📋 Next Steps (Integration)

### Phase 1: Connect to Settlement API ⏳
**File**: `services/settlement-engine/settlement-api.cjs`

Add endpoint:
```javascript
app.post('/api/settlements/calculate', async (req, res) => {
  const { merchantId, cycleDate } = req.body;
  const result = await calculateMerchantSettlement(merchantId, cycleDate);
  res.json(result);
});
```

### Phase 2: Update Settlement Queue Processor ⏳
**File**: `services/settlement-engine/settlement-queue-processor.cjs`

Replace old calculator:
```javascript
const { calculateMerchantSettlement, completeSettlementProcessing } =
  require('./settlement-calculator-with-deductions.cjs');

// In processing loop:
const settlement = await calculateMerchantSettlement(merchantId, cycleDate);
// ... create payout ...
await completeSettlementProcessing(settlement, batchId);
```

### Phase 3: Update UI to Show Breakdown ⏳
**File**: `src/pages/ops/SettlementDetails.tsx`

Show breakdown:
- Gross amount
- Fees breakdown
- Refunds (current + outstanding)
- Chargebacks
- Outstanding debt recovered
- Net payout

---

## ✅ Summary

### What's Complete:
- ✅ Database migration (Migration 028)
- ✅ Settlement calculator logic (600+ lines)
- ✅ Refund deduction logic (same-cycle + cross-cycle)
- ✅ Chargeback deduction logic (LOST only)
- ✅ Negative balance protection with debt tracking
- ✅ Outstanding debt recovery
- ✅ Processing flags (prevent double-deduction)
- ✅ Test scenarios (5 comprehensive tests)

### What's Left (Integration):
- ⏳ Connect calculator to settlement API
- ⏳ Update settlement queue processor
- ⏳ Update UI to display deductions
- ⏳ Test end-to-end with real data

### How It Handles Your Scenario:
```
Sep 21: Transaction ₹10,000
Sep 25: Refund ₹10,000 (4 days later, before settlement)
Sep 30: Settlement runs

Result: Net = Gross - Refund = ₹10,000 - ₹10,000 = ₹0
Merchant gets: ₹0 (clean, no debt)

Sep 21: Transaction ₹10,000
Sep 30: Settlement → Merchant gets ₹10,000
Oct 4: Refund ₹10,000 (after settlement)
Oct 7: Next settlement with ₹30,000 new sales

Result: Net = ₹30,000 - ₹10,000 (outstanding refund) = ₹20,000
Merchant gets: ₹20,000 (refund recovered from next cycle)
```

---

**🎉 Settlement calculator with refunds & chargebacks is complete and ready for integration! 🎉**
