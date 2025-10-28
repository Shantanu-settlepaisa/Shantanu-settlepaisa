# Deploy V1 Mapper Database Fix to Staging 2

## Problem Fixed
V1 mapper was hardcoded to connect to old database (`13.201.179.44`), causing bank file uploads to fail because it couldn't find HDFC BANK config from Staging 2 RDS.

## Changes Made
- `services/api/v1-column-mapper.js`: Now uses `config.db` from `env.cjs` instead of hardcoded database connection
- Added logging to show which database V1 mapper connects to

## Deployment Steps

### 1. SSH to Staging 2 EC2
```bash
ssh ec2-user@52.66.199.215
cd /home/ec2-user/ops-dashboard
```

### 2. Verify .env File Points to RDS
```bash
cat services/overview-api/.env
```

**Required values for Staging 2:**
```bash
# Database Configuration - MUST point to RDS
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=SettlePaisa2024
```

If incorrect, update the file:
```bash
nano services/overview-api/.env
# Update DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
# Save and exit (Ctrl+X, Y, Enter)
```

### 3. Pull Latest Code
```bash
git fetch origin
git checkout feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports
```

### 4. Restart Upload API
```bash
pm2 restart upload-api
```

### 5. Check Logs for Database Connection
```bash
pm2 logs upload-api --lines 20
```

**Look for:**
```
[Config] Environment loaded: {
  nodeEnv: 'production',
  dbHost: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  dbName: 'settlepaisa_v2',
  ...
}
[V1 Mapper] Database connection: {
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  user: 'postgres'
}
```

**⚠️ If you see:**
```
host: '13.201.179.44'  ❌ WRONG - still using old database
host: 'localhost'      ❌ WRONG - not reading .env correctly
```

Then the .env file is not configured correctly.

## Verification

### 6. Test Bank File Upload

**Upload test files via dashboard:**
1. Open: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
2. Login with test credentials
3. Go to Recon Workspace
4. Upload:
   - PG file: `test-manual-pg-v1-oct28.csv`
   - Bank file: `hdfc-bank-oct28-with-net-amount.csv`
   - Select "HDFC BANK" as sourceType for bank file

### 7. Check Database for Bank Statements
```bash
# On your local machine
node check-bank-statements-all.cjs
```

**Expected output:**
```
✅ Found 10 bank statements
Bank statements uploaded TODAY: 10
```

**If still 0 rows:**
- Check upload API logs for errors: `pm2 logs upload-api --err`
- Check if HDFC BANK config exists in database:
  ```sql
  SELECT * FROM sp_v2_bank_column_mappings
  WHERE UPPER(bank_name) = 'HDFC BANK';
  ```

### 8. Run Reconciliation
After successful bank upload, run reconciliation and verify:
- 10 matches (not exceptions)
- ₹2,20,000 total matched
- Financial dashboard shows correct data

## Rollback (if needed)
```bash
git checkout <previous-commit-hash>
pm2 restart upload-api
```

## Expected Outcome
✅ Bank file uploads work correctly
✅ V1 mapper finds HDFC BANK config from RDS
✅ Bank statements appear in `sp_v2_bank_statements` table
✅ Reconciliation matches all transactions
✅ Financial dashboard shows correct metrics

## Contact
If issues persist, check:
1. Upload API logs: `pm2 logs upload-api --err`
2. Database connectivity: Can EC2 reach RDS?
3. HDFC BANK config: Does it exist in `sp_v2_bank_column_mappings`?
