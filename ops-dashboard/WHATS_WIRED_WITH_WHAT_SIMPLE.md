# What's Wired With What? - Simple Explanation

Think of the system like a factory assembly line. Each station is connected to the next, and work flows automatically from one to another.

---

## The Complete Wiring (Flow Chart)

```
┌─────────────────────────────────────────────────────────────────┐
│                    START: TRANSACTION UPLOADED                   │
│                                                                  │
│  Someone uploads a CSV file with transactions                   │
│         ↓                                                        │
│  Saved in TABLE: sp_v2_transactions                             │
│  Status: PENDING                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (Recon API matches it)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                   WIRE #1: RECONCILIATION TRIGGER                │
│                                                                  │
│  When status changes to RECONCILED:                             │
│         ↓                                                        │
│  ⚡ TRIGGER FIRES: fn_transaction_status_change()               │
│         ↓                                                        │
│  Automatically creates entry in TABLE: sp_v2_settlement_queue   │
│  Status: PENDING                                                 │
│         ↓                                                        │
│  Sends notification: "Hey, new transaction ready!"              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (notification travels through PostgreSQL)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│            WIRE #2: QUEUE PROCESSOR LISTENING                    │
│                                                                  │
│  SERVICE: settlement-queue-processor                            │
│  Is constantly listening for notifications                       │
│         ↓                                                        │
│  Receives: "New transaction in queue!"                          │
│         ↓                                                        │
│  Waits 5 minutes (to batch multiple transactions)              │
│         ↓                                                        │
│  Wakes up and processes batch                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│          WIRE #3: SETTLEMENT CALCULATION & STORAGE               │
│                                                                  │
│  Queue processor reads from: sp_v2_settlement_queue             │
│         ↓                                                        │
│  Calculates: fees, taxes, reserves, net amount                  │
│         ↓                                                        │
│  Writes to TABLE: sp_v2_settlement_batches                      │
│  (This is the settlement summary)                               │
│         ↓                                                        │
│  Writes to TABLE: sp_v2_settlement_items                        │
│  (These are individual transaction details)                     │
│         ↓                                                        │
│  Updates original TABLE: sp_v2_transactions                     │
│  Status: RECONCILED → SETTLED                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│             WIRE #4: RESERVE & COMMISSION TRACKING               │
│                                                                  │
│  Queue processor also writes to:                                │
│         ↓                                                        │
│  TABLE: sp_v2_merchant_reserve_ledger                           │
│  Records: "Held ₹5,000 as reserve for this batch"              │
│         ↓                                                        │
│  TABLE: sp_v2_commission_audit                                  │
│  Records: "Charged 2.5% because merchant is in Tier 2"         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (if amount < ₹1 lakh, auto-approved)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│              WIRE #5: BANK TRANSFER QUEUE                        │
│                                                                  │
│  Settlement scheduler checks: sp_v2_settlement_batches          │
│  Looking for: Status = APPROVED                                 │
│         ↓                                                        │
│  Creates entry in TABLE: sp_v2_bank_transfer_queue             │
│  This says: "Send ₹95,000 to merchant account"                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (payout processor picks it up)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│         WIRE #6: BANK API CALL & UTR GENERATION                 │
│                                                                  │
│  SERVICE: payout-processor (needs to be built)                  │
│  Reads from: sp_v2_bank_transfer_queue                          │
│         ↓                                                        │
│  Calls: Bank API (ICICI/HDFC/Axis)                             │
│  Sends: Account number, IFSC, amount                            │
│         ↓                                                        │
│  Bank responds with: UTR (like "ICICI202501071234567")         │
│         ↓                                                        │
│  Writes to TABLE: sp_v2_settlement_bank_transfers              │
│  Status: COMPLETED                                               │
│  UTR: ICICI202501071234567                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (UTR saved, now trigger fires)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│         WIRE #7: BANK TRANSFER COMPLETION TRIGGER                │
│                                                                  │
│  When bank_transfers status changes to COMPLETED:              │
│         ↓                                                        │
│  ⚡ TRIGGER FIRES: fn_update_settlement_on_transfer_complete()  │
│         ↓                                                        │
│  Updates TABLE: sp_v2_settlement_batches                        │
│  Status: APPROVED → PAID                                         │
│         ↓                                                        │
│  Updates TABLE: sp_v2_transactions                              │
│  Status: SETTLED → PAID                                          │
│         ↓                                                        │
│  Updates TABLE: sp_v2_bank_transfer_queue                       │
│  Status: processing → completed                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓ (Later, bank statement is imported)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│           WIRE #8: BANK STATEMENT AUTO-MATCHING                 │
│                                                                  │
│  Ops team imports bank statement (CSV from bank)                │
│         ↓                                                        │
│  Each row inserted into TABLE: sp_v2_bank_statement_entries    │
│         ↓                                                        │
│  ⚡ TRIGGER FIRES: fn_auto_match_bank_statement()               │
│         ↓                                                        │
│  Looks for matching UTR in sp_v2_settlement_bank_transfers     │
│         ↓                                                        │
│  If found:                                                      │
│    - Updates bank_transfers: bank_statement_matched = TRUE      │
│    - Updates bank_transfers: verification_status = VERIFIED     │
│    - Links the two records together                             │
│         ↓                                                        │
│  Writes to TABLE: sp_v2_payout_verification_log                │
│  Records: "Verified UTR123 on 2025-01-07 via bank statement"   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                            ↓
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    END: FULLY VERIFIED PAYMENT                   │
│                                                                  │
│  Transaction status: PAID ✅                                    │
│  Settlement status: PAID ✅                                     │
│  Bank transfer status: COMPLETED ✅                             │
│  Verification status: FULLY_VERIFIED ✅                         │
│                                                                  │
│  Money is in merchant's account                                 │
│  UTR is verified with bank statement                            │
│  Complete audit trail exists                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## The 8 Wires Explained Simply

### Wire #1: Reconciliation → Queue
**What:** When a transaction is matched (reconciled), automatically add it to the settlement queue

**How it works:**
- Database trigger watches `sp_v2_transactions` table
- When status changes to "RECONCILED"
- Trigger automatically creates entry in `sp_v2_settlement_queue`
- Like: Transaction is verified → Put it in the "ready to pay" basket

**Before wiring:** Manual - someone had to run a script daily  
**After wiring:** Automatic - happens instantly when transaction is reconciled

---

### Wire #2: Queue → Processor Service
**What:** Notify the settlement processor that new transactions are waiting

**How it works:**
- When Wire #1 puts transaction in queue
- Database sends notification (like a text message)
- Settlement processor service is listening 24/7
- Service receives notification and wakes up
- Like: Doorbell rings → You go answer the door

**Before wiring:** Processor checked every hour (slow)  
**After wiring:** Instant notification when work arrives

---

### Wire #3: Processor → Settlement Tables
**What:** Calculate settlement and store all the details

**How it works:**
- Processor reads pending transactions from queue
- Calculates: gross amount, fees, taxes, net amount
- Stores summary in `sp_v2_settlement_batches`
- Stores details in `sp_v2_settlement_items`
- Updates original transaction status to "SETTLED"
- Like: Chef takes order → Cooks food → Puts it on serving table

**Before wiring:** Manual calculation in Excel, copy-paste to database  
**After wiring:** Fully automatic in 5 minutes

---

### Wire #4: Processor → Audit Tables
**What:** Keep track of why fees were charged and how much is held in reserve

**How it works:**
- While calculating settlement, processor also:
  - Writes to `sp_v2_merchant_reserve_ledger` (reserve holds)
  - Writes to `sp_v2_commission_audit` (why 2.5% was charged)
- Like: Keep detailed receipts for every deduction

**Before wiring:** No record of why amounts were deducted  
**After wiring:** Complete audit trail for disputes

---

### Wire #5: Settlement → Bank Transfer Queue
**What:** When settlement is approved, queue it for bank transfer

**How it works:**
- Settlement scheduler checks for approved settlements
- Creates entry in `sp_v2_bank_transfer_queue`
- Entry says: "Pay ₹X to account 123456"
- Like: Approved invoice → Put in "Send payment" pile

**Before wiring:** Manual - ops team had to initiate transfers  
**After wiring:** Automatic queueing (still need manual bank API call)

---

### Wire #6: Queue → Bank API → Bank Transfer Table
**What:** Actually send money through bank and get UTR (proof)

**How it works:**
- Payout processor reads from queue
- Calls bank API: "Transfer ₹95,000 to account 123456"
- Bank processes and returns UTR (like ICICI202501071234567)
- Processor stores UTR in `sp_v2_settlement_bank_transfers`
- Like: Hand check to bank → Bank gives you receipt number

**Status:** ⚠️ **NOT YET WIRED** (payout processor service not built)  
**Current:** Manual - ops copies UTR from bank portal

---

### Wire #7: Bank Transfer Complete → Update Everything
**What:** When bank transfer is done, update all related tables

**How it works:**
- Database trigger watches `sp_v2_settlement_bank_transfers`
- When status changes to "COMPLETED" (with UTR)
- Trigger automatically:
  - Updates settlement batch: Status → PAID
  - Updates transaction: Status → PAID
  - Updates queue: Status → completed
- Like: Package delivered → Mark order as complete everywhere

**Before wiring:** Had to manually update 3 different places  
**After wiring:** One change updates everything automatically

---

### Wire #8: Bank Statement Import → Auto-Verify
**What:** When bank statement is imported, automatically match and verify UTRs

**How it works:**
- Ops imports bank statement CSV
- Each row inserted into `sp_v2_bank_statement_entries`
- Trigger automatically looks for matching UTR
- If found, marks transfer as "bank verified"
- Logs the verification in audit table
- Like: Match bank receipt with your own records automatically

**Before wiring:** Manual matching in Excel  
**After wiring:** Instant automatic matching

---

## Real-World Example

**Scenario:** Merchant has 100 transactions that just got reconciled

### The Journey (With All Wires Working):

**10:00 AM** - Recon completes, 100 transactions marked RECONCILED
- 🔌 **Wire #1** fires: 100 entries added to settlement_queue
- 🔌 **Wire #2** fires: Notification sent to processor

**10:01 AM** - Processor wakes up, sees 100 transactions
- Waits 5 minutes to see if more transactions come

**10:06 AM** - Processor starts work
- 🔌 **Wire #3** fires: Calculates settlement, creates batch
- 🔌 **Wire #4** fires: Logs reserves (₹5,000) and commission (2.5%)
- Settlement batch created: Net amount = ₹95,000

**10:07 AM** - Processor checks amount < ₹1L, auto-approves

**10:08 AM** - Settlement scheduler sees approved batch
- 🔌 **Wire #5** fires: Creates entry in bank_transfer_queue

**10:09 AM** - Payout processor picks it up (when built)
- 🔌 **Wire #6** fires: Calls ICICI Bank API
- Bank returns UTR: ICICI202501071234567
- Saves to bank_transfers table

**10:10 AM** - Bank transfer marked COMPLETED
- 🔌 **Wire #7** fires: Updates batch → PAID, transaction → PAID

**11:00 AM** - Ops imports today's bank statement
- 🔌 **Wire #8** fires: Auto-matches UTR ICICI202501071234567
- Marks as FULLY_VERIFIED

**Result:** Money is in merchant account, everything is verified, full audit trail exists

---

## Visual: Which Table Connects To What

```
sp_v2_transactions (Transaction data)
    ↓ [Wire #1 - Trigger]
sp_v2_settlement_queue (Queue for processing)
    ↓ [Wire #2 - Notification]
settlement-queue-processor (SERVICE - calculates)
    ↓ [Wire #3 - Creates records]
sp_v2_settlement_batches (Summary)
    ├─→ sp_v2_settlement_items (Details)
    ├─→ [Wire #4] sp_v2_merchant_reserve_ledger (Reserve audit)
    └─→ [Wire #4] sp_v2_commission_audit (Commission audit)
    ↓ [Wire #5 - Scheduler]
sp_v2_bank_transfer_queue (Payment queue)
    ↓ [Wire #6 - Payout processor]
Bank API (ICICI/HDFC/Axis)
    ↓ [Wire #6 - Returns UTR]
sp_v2_settlement_bank_transfers (Payment records)
    ↓ [Wire #7 - Trigger]
sp_v2_settlement_batches (Status: PAID)
sp_v2_transactions (Status: PAID)
    ↓ [Later...]
sp_v2_bank_statement_entries (Bank statement import)
    ↓ [Wire #8 - Trigger]
sp_v2_settlement_bank_transfers (Verification: VERIFIED)
sp_v2_payout_verification_log (Audit log)
```

---

## Summary: The Power of Wiring

### Before Wiring (Manual):
1. ❌ Someone runs daily cron to start settlement
2. ❌ Someone manually calculates settlements
3. ❌ Someone manually initiates bank transfers
4. ❌ Someone manually copies UTR from bank
5. ❌ Someone manually updates status in database
6. ❌ Someone manually matches bank statement in Excel
7. ❌ No audit trail for reserves or commissions

### After Wiring (Automatic):
1. ✅ Transaction reconciled → Auto-queued (Wire #1)
2. ✅ Queued → Auto-processed (Wire #2)
3. ✅ Processed → Auto-stored (Wire #3)
4. ✅ Stored → Auto-audited (Wire #4)
5. ✅ Approved → Auto-queued for payment (Wire #5)
6. ✅ Payment → Auto-verified (Wire #7)
7. ✅ Bank statement → Auto-matched (Wire #8)
8. ✅ Complete audit trail everywhere

**Only Wire #6 needs manual work** (until payout processor is built)

---

## Key Insight

**Think of it like dominoes:**
- You tip the first domino (mark transaction as RECONCILED)
- All other dominoes fall automatically (8 wires trigger in sequence)
- No human intervention needed
- Everything is logged and tracked
- End result: Money in merchant account, fully verified

**The wiring is the connections between dominoes!**

---

## What's Still Missing?

Only **1 wire** is not fully connected:

**Wire #6: Payout Processor Service**
- Database tables exist ✅
- Queue system works ✅
- Triggers are ready ✅
- **Missing:** Service that calls bank API and gets real UTR
- **Workaround:** Manually copy UTR from bank portal (works but slow)

Everything else is **100% wired and working automatically**.
