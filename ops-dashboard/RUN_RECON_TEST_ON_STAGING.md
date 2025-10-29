# Execute Reconciliation-to-Settlement Test on Staging

## Prerequisites

You need the SSH key: `settlepaisa-backend-key.pem`

**Find the key:**
```bash
# Search common locations
find ~/Downloads -name "*settlepaisa*backend*.pem" -o -name "*backend*key*.pem" 2>/dev/null
find ~ -name "settlepaisa-backend-key.pem" 2>/dev/null

# If not found, download from AWS Console:
# EC2 > Key Pairs > settlepaisa-backend-key > Download (if you have access)
```

## Steps to Run Test

### Step 1: Copy Test Script to Staging EC2

```bash
# Replace <PATH_TO_KEY> with your actual key location
scp -i <PATH_TO_KEY> execute-recon-test.cjs ec2-user@13.201.179.44:/home/ec2-user/settlepaisa-ops/
```

Example:
```bash
scp -i ~/Downloads/settlepaisa-backend-key.pem execute-recon-test.cjs ec2-user@13.201.179.44:/home/ec2-user/settlepaisa-ops/
```

### Step 2: SSH into Staging EC2

```bash
ssh -i <PATH_TO_KEY> ec2-user@13.201.179.44
```

### Step 3: Run the Test

```bash
cd /home/ec2-user/settlepaisa-ops
node execute-recon-test.cjs
```

## What the Test Does

### 1. **Insert Test PG Transactions** (3 transactions)
- PG_TEST_001: ₹500 (UPI, HDFC)
- PG_TEST_002: ₹750 (Net Banking, ICICI)
- PG_TEST_003: ₹1,000 (UPI, SBI)

### 2. **Insert Test Bank Statements** (3 matching entries)
- UTR001: ₹500
- UTR002: ₹750
- UTR003: ₹1,000

### 3. **Run Reconciliation**
- Match PG transactions with bank statements by amount
- Update transaction status to RECONCILED
- Set UTR field

### 4. **Wait for Settlement Queue** (10 seconds)
- Database trigger should auto-queue RECONCILED transactions
- Verifies entries in `sp_v2_settlement_queue`

### 5. **Wait for Settlement Batch** (50 seconds)
- PM2 process 11 (settlement-queue-processor) runs every minute
- Should create settlement batch with all 3 transactions

### 6. **Verify All Tables**

The test will show live data from:

#### ✅ sp_v2_transactions
Expected: 3 rows with status RECONCILED

#### ✅ sp_v2_bank_statements
Expected: 3 rows with UTR001, UTR002, UTR003

#### ✅ sp_v2_settlement_queue
Expected: 3 rows queued automatically by trigger

#### ✅ sp_v2_settlement_batches
Expected: 1 batch with:
- Total Gross: ₹2,250 (₹22,50,00 paise)
- Commission (2%): ₹45.00
- GST (18% on commission): ₹8.10
- Reserve (4%): ₹90.00
- **Net Payout**: ₹2,106.90

#### ✅ sp_v2_settlement_items
Expected: 3 items showing individual transaction breakdowns

#### ✅ sp_v2_merchant_reserve_ledger
Expected: 1 HOLD entry for ₹90.00

#### ✅ sp_v2_commission_audit
Expected: 1 entry with commission ₹45.00 + GST ₹8.10

## Expected Timeline

- **0:00** - Insert transactions and bank statements
- **0:05** - Reconcile transactions
- **0:10** - Settlement queue populated (trigger fires)
- **1:00** - Settlement batch created (PM2 processor runs)
- **1:05** - All 7 tables verified

Total test duration: **~60 seconds**

## Troubleshooting

### If settlement queue is empty after 10 seconds

Check trigger is enabled:
```sql
SELECT tgenabled FROM pg_trigger WHERE tgname = 'auto_queue_reconciled_transactions';
```

### If settlement batch is not created after 60 seconds

Check PM2 process:
```bash
pm2 status | grep settlement
pm2 logs 11 --lines 50 --nostream
```

Restart if needed:
```bash
pm2 restart 11
```

### Check processor is running

```bash
ps aux | grep settlement-queue-processor
```

## Alternative: Run Directly from Your Machine

If you want me to execute this test, please provide:

1. **SSH Key Location**: Where is `settlepaisa-backend-key.pem` stored?
2. **Or**: Copy the key to `/tmp/settlepaisa-backend-key.pem` with proper permissions:
   ```bash
   chmod 400 /tmp/settlepaisa-backend-key.pem
   ```

Then I can run:
```bash
scp -i /tmp/settlepaisa-backend-key.pem execute-recon-test.cjs ec2-user@13.201.179.44:/home/ec2-user/settlepaisa-ops/ && \
ssh -i /tmp/settlepaisa-backend-key.pem ec2-user@13.201.179.44 "cd /home/ec2-user/settlepaisa-ops && node execute-recon-test.cjs"
```

---

## Files Ready

- ✅ `execute-recon-test.cjs` - Complete test script
- ✅ `test-pg-transactions-recon.csv` - Sample PG data
- ✅ `test-bank-statement-recon.csv` - Sample bank data

**EC2 Instance**: i-08ac67ac776d4ab23 (13.201.179.44)  
**RDS Endpoint**: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432
