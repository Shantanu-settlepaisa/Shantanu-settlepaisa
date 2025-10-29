# SettlePaisa 2.0 - Complete User Flow Explained (Layman Terms)

**Date:** October 7, 2025  
**For:** Non-technical Understanding

---

## 🎯 The Big Picture (What's Happening?)

Think of SettlePaisa as a **smart money tracking and settlement system** for payment gateways. Here's the journey money takes:

```
Money comes in → Track it → Match with bank → Calculate settlement → Pay merchant
```

---

## 📊 Stage 1: Getting Transaction Data (3 Ways)

### Way 1: Manual File Upload (Most Common)
**What happens:**
1. User logs into Ops Dashboard
2. Goes to "Manual Upload" page
3. Uploads 2 CSV files:
   - **PG Transactions file** - "Here's what payments we received"
   - **Bank Statement file** - "Here's what the bank actually credited"

**What the system does:**
```
User uploads files
    ↓
Files go to Upload API (port 5109)
    ↓
System reads CSV and inserts data into TWO tables:
    • sp_v2_transactions (PG transactions) - source_type = 'MANUAL_UPLOAD'
    • sp_v2_bank_statements (Bank statements)
```

**Example:**
- User uploads `HDFC_PG_Transactions_Oct.csv` (500 transactions)
- User uploads `HDFC_Bank_Statement_Oct.csv` (480 credits)
- System stores: 500 rows in sp_v2_transactions, 480 rows in sp_v2_bank_statements

### Way 2: Real-time Webhooks (Automatic)
**What happens:**
```
Razorpay/PayU sends payment notification
    ↓
pg-ingestion service receives it (port 5112)
    ↓
Instantly saves to sp_v2_transactions - source_type = 'WEBHOOK'
```

**Example:**
- Customer pays ₹1,000 via Razorpay
- Razorpay immediately sends webhook to our system
- System saves: Transaction PGW123 - ₹1,000 - Status: SUCCESS

### Way 3: API Polling (Background)
**What happens:**
```
Every 2 minutes, system checks SabPaisa V1 API
    ↓
"Hey, any new transactions?"
    ↓
Fetches and saves to sp_v2_transactions - source_type = 'API_SYNC'
```

---

## 🔍 Stage 2: Reconciliation (Matching Money)

**The Problem:** 
Did the money we think we received actually reach our bank?

**What reconciliation does:**
It **matches** PG transactions with bank statements to find:
- ✅ **MATCHED** - "Yes! PG says ₹1,000, bank got ₹1,000" 
- ❌ **UNMATCHED_PG** - "We have a PG transaction, but bank didn't credit"
- ❌ **UNMATCHED_BANK** - "Bank credited money, but we don't have a PG transaction"
- ⚠️ **EXCEPTION** - "Amounts don't match (PG: ₹1,000, Bank: ₹998)"

**How it happens:**

### Automatic Reconciliation
```
System runs every hour (cron job)
    ↓
Recon API (port 5103) checks:
    "Are there new transactions uploaded?"
    ↓
If yes, runs matching algorithm:
    - Match by UTR (bank reference number)
    - Match by amount + date
    - Match by payment mode + date
    ↓
Results saved to: sp_v2_reconciliation_results
```

**What gets stored:**
```sql
-- For MATCHED transactions
pg_transaction_id: "PGW123"
bank_statement_id: "BANK456"
match_status: "MATCHED"
match_score: 100

-- Transaction status updated
sp_v2_transactions.status: "PENDING" → "RECONCILED" ✅
```

**IMPORTANT:** ⚠️ **No automatic triggers on status change!** 

When a transaction status changes from PENDING → RECONCILED, **NOTHING automatically happens**. The settlement calculation is **NOT triggered automatically**.

---

## 💰 Stage 3: Settlement Calculation (The Big One!)

### How Settlements Are Triggered (3 Ways)

#### Method 1: Scheduled Cron Job ⏰
```
Every day at 6:00 AM (configured in settlement-scheduler.cjs)
    ↓
Settlement Scheduler wakes up
    ↓
"Let me find all reconciled transactions that haven't been settled yet"
    ↓
Runs settlement calculation
```

**Code location:** `services/settlement-engine/settlement-scheduler.cjs`

#### Method 2: Manual Trigger via API 👆
```
User clicks "Run Settlement" button in Ops Dashboard
    ↓
POST /api/run-settlement
    ↓
Settlement API manually triggers calculation
```

**Code location:** `services/settlement-engine/settlement-api.cjs`

#### Method 3: Manual Script Execution 🔧
```
Admin runs: node manual-settlement-trigger.cjs
    ↓
Directly calls settlement calculator
```

### What Happens During Settlement Calculation

**Step-by-Step Process:**

```
1️⃣ Find Eligible Transactions
   ↓
   Query: "Give me all RECONCILED transactions that haven't been settled"
   
   SELECT * FROM sp_v2_transactions 
   WHERE status = 'RECONCILED' 
     AND settlement_batch_id IS NULL

2️⃣ Group by Merchant & Date
   ↓
   Example: 
   - Merchant ABC: 50 transactions on Oct 1st
   - Merchant ABC: 30 transactions on Oct 2nd
   - Merchant XYZ: 20 transactions on Oct 1st

3️⃣ Calculate Settlement for Each Batch
   ↓
   For Merchant ABC, Oct 1st batch:
   
   Gross Amount: ₹1,00,000 (sum of all 50 transactions)
   
   Deductions:
   - Commission (2.5%): ₹2,500
   - GST on Commission (18%): ₹450
   - TDS (1%): ₹1,000
   - Rolling Reserve (5%): ₹5,000
   
   Net Settlement: ₹91,050 💸

4️⃣ Create Settlement Batch
   ↓
   INSERT INTO sp_v2_settlement_batches (
     merchant_id: 'ABC',
     cycle_date: '2025-10-01',
     gross_amount_paise: 10000000,
     commission_paise: 250000,
     gst_paise: 45000,
     tds_paise: 100000,
     reserve_paise: 500000,
     net_settlement_amount: 9105000
   )
   
   Returns: batch_id = "batch-123-uuid"

5️⃣ Create Settlement Items (One per Transaction)
   ↓
   For each of the 50 transactions:
   
   INSERT INTO sp_v2_settlement_items (
     batch_id: 'batch-123-uuid',
     transaction_id: 'PGW17592301073920',
     gross_paise: 200000,
     commission_paise: 5000,
     gst_paise: 900,
     tds_paise: 2000,
     reserve_paise: 10000,
     net_paise: 182100
   )
   
   Creates 50 rows (one per transaction)

6️⃣ Update Transactions
   ↓
   UPDATE sp_v2_transactions
   SET settlement_batch_id = 'batch-123-uuid'
   WHERE transaction_id IN (those 50 transactions)
   
   ✅ Now transactions are linked to their settlement batch

7️⃣ Create Transaction Mapping (Tracking)
   ↓
   INSERT INTO sp_v2_settlement_transaction_map (
     batch_id: 'batch-123-uuid',
     transaction_id: 'PGW17592301073920'
   )
   
   Creates another link for easy lookup
```

**Code location:** `services/settlement-engine/settlement-calculator-v3.cjs`

---

## 🏦 Stage 4: Bank Transfer (Paying the Merchant)

### When Bank Transfer Happens

**Two conditions must be met:**

1. **Merchant has auto_settle enabled** 
   ```sql
   sp_v2_merchant_settlement_config.auto_settle = true
   ```

2. **Net amount exceeds minimum threshold**
   ```sql
   net_settlement_amount >= min_settlement_amount_paise
   ```

**Example:**
- Merchant ABC: auto_settle = true, minimum = ₹10,000
- Settlement calculated: ₹91,050
- ✅ Both conditions met → Queue bank transfer

### What Happens

```
Settlement batch approved
    ↓
INSERT INTO sp_v2_settlement_bank_transfers (
  batch_id: 'batch-123-uuid',
  merchant_id: 'ABC',
  account_number: '1234567890',
  ifsc_code: 'HDFC0001234',
  amount_paise: 9105000,
  transfer_mode: 'NEFT',
  status: 'PENDING'
)
    ↓
Status: PENDING → Processing → Initiated
    ↓
External bank API called (HDFC/ICICI/etc)
    ↓
Bank processes transfer
    ↓
Status: Initiated → COMPLETED ✅
    ↓
Money reaches merchant's account 💰
```

---

## 🔄 Complete Data Flow (Visual)

```
┌─────────────────────────────────────────────────────┐
│ STAGE 1: Transaction Ingestion                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Manual Upload    Webhooks      API Polling        │
│       ↓              ↓              ↓               │
│       └──────────────┴──────────────┘               │
│                      ↓                              │
│         sp_v2_transactions (1,179 rows)             │
│         sp_v2_bank_statements (753 rows)            │
│                                                     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ STAGE 2: Reconciliation                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Recon API runs matching algorithm                  │
│       ↓                                             │
│  sp_v2_reconciliation_results (stores matches)      │
│       ↓                                             │
│  UPDATE sp_v2_transactions                          │
│  SET status = 'RECONCILED'  ✅                       │
│                                                     │
│  ⚠️  NO TRIGGERS - Nothing happens automatically!   │
│                                                     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ STAGE 3: Settlement Calculation                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Triggered by: Cron Job OR Manual Button OR Script  │
│       ↓                                             │
│  Settlement Scheduler                               │
│  "Find all RECONCILED transactions"                 │
│       ↓                                             │
│  SELECT * FROM sp_v2_transactions                   │
│  WHERE status = 'RECONCILED'                        │
│    AND settlement_batch_id IS NULL                  │
│       ↓                                             │
│  Settlement Calculator                              │
│  - Calculate commission, GST, TDS, reserve          │
│  - Net amount = Gross - All deductions              │
│       ↓                                             │
│  INSERT INTO sp_v2_settlement_batches (batch)       │
│  INSERT INTO sp_v2_settlement_items (50 rows)       │
│  UPDATE sp_v2_transactions                          │
│    SET settlement_batch_id = 'batch-123'            │
│                                                     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ STAGE 4: Bank Transfer                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  IF auto_settle = true                              │
│  AND amount >= minimum                              │
│       ↓                                             │
│  INSERT INTO sp_v2_settlement_bank_transfers        │
│  status = 'PENDING'                                 │
│       ↓                                             │
│  Call Bank API                                      │
│       ↓                                             │
│  UPDATE status = 'COMPLETED'                        │
│       ↓                                             │
│  💰 Money in merchant's bank account                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 Key Tables & Their Purpose

| Table | Purpose | When Updated |
|-------|---------|--------------|
| **sp_v2_transactions** | All incoming transactions | File upload, webhook, API sync |
| **sp_v2_bank_statements** | Bank credits | File upload |
| **sp_v2_reconciliation_results** | Match results | After reconciliation |
| **sp_v2_settlement_batches** | Settlement summary per merchant/date | When settlement runs |
| **sp_v2_settlement_items** | Individual transaction breakdowns | When settlement runs |
| **sp_v2_settlement_transaction_map** | Link transactions to batches | When settlement runs |
| **sp_v2_settlement_bank_transfers** | Bank transfer records | When payment initiated |

---

## ❓ Common Questions

### Q1: Is settlement automatic after reconciliation?
**A:** ❌ NO! Reconciliation just marks transactions as "RECONCILED". Settlement calculation must be triggered separately (cron job, manual button, or script).

### Q2: Are there database triggers that auto-create settlements?
**A:** ❌ NO! The only trigger on `sp_v2_transactions` is `fn_create_exception_workflow` which handles exception workflows, NOT settlements.

### Q3: How often does settlement run?
**A:** It depends on the cron schedule configured in `settlement-scheduler.cjs`. Typically:
- Daily at 6:00 AM
- Or manually triggered by admin

### Q4: Can a transaction be settled without being reconciled?
**A:** ❌ NO! The settlement query specifically looks for `status = 'RECONCILED'`. Transactions with status PENDING, EXCEPTION, etc. are skipped.

### Q5: What if reconciliation finds a mismatch?
**A:** Transaction status becomes 'EXCEPTION'. It will NOT be included in settlement until the exception is resolved (manually reviewed and fixed).

---

## 📈 Real Example (End-to-End)

**October 1st, 2025:**

```
09:00 AM - User uploads files
  • 500 PG transactions (₹10,00,000)
  • 480 bank credits (₹9,80,000)
  ↓
  sp_v2_transactions: 500 rows added (status = PENDING)
  sp_v2_bank_statements: 480 rows added

10:00 AM - Reconciliation runs (cron)
  ↓
  Matching algorithm runs
  ↓
  Results:
  • 475 MATCHED (status → RECONCILED)
  • 20 UNMATCHED_PG (status → UNMATCHED)
  • 5 UNMATCHED_BANK (no PG transaction)
  • 0 EXCEPTIONS
  ↓
  sp_v2_reconciliation_results: 500 rows added
  sp_v2_transactions: 475 rows updated to RECONCILED

06:00 AM (Next Day) - Settlement runs (cron)
  ↓
  Finds 475 RECONCILED transactions
  ↓
  Groups by merchant:
    • Merchant ABC: 300 txns (₹6,00,000)
    • Merchant XYZ: 175 txns (₹3,80,000)
  ↓
  Calculates for Merchant ABC:
    Gross: ₹6,00,000
    Commission (2.5%): ₹15,000
    GST (18%): ₹2,700
    TDS (1%): ₹6,000
    Reserve (5%): ₹30,000
    Net: ₹5,46,300
  ↓
  Creates:
    • sp_v2_settlement_batches: 2 rows (ABC, XYZ)
    • sp_v2_settlement_items: 475 rows (one per txn)
    • sp_v2_settlement_transaction_map: 475 rows
  ↓
  Updates:
    • sp_v2_transactions: 475 rows (set batch_id)

06:05 AM - Bank Transfer (if auto_settle = true)
  ↓
  Checks: ABC has auto_settle = true, min = ₹10,000
  ↓
  Creates bank transfer record
  ↓
  Calls bank API
  ↓
  Money transferred: ₹5,46,300 → ABC's account 💰
```

---

## 🚀 Summary (TL;DR)

1. **Transactions come in** (upload/webhook/API) → `sp_v2_transactions`
2. **Reconciliation matches them** with bank → Status changes to `RECONCILED`
3. **⚠️ NO automatic settlement** - Must be triggered!
4. **Settlement runs** (cron/manual) → Calculates commissions → Creates batches
5. **Bank transfer initiated** (if auto_settle) → Money paid to merchant

**Key Point:** 🔴 **Settlement is NOT automatic!** It must be explicitly triggered, either by cron job or manual action.

---

**Document Version:** 1.0  
**Created:** October 7, 2025  
**Purpose:** Explain data flow for non-technical stakeholders
