# Merchant Dashboard Fix - Complete Guide

## Problem
Merchant dashboard shows no data because:
1. **Missing data**: RDS database missing `sp_v2_merchant_master` table data (15,399 merchants)
2. **Wrong merchant ID**: Backend configured with UUID `11111111-1111-1111-1111-111111111111` instead of `MERCH001`

## Database Credentials (SAVE THESE)
```
RDS Endpoint: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
Port: 5432
Database: settlepaisa_v2
Username: postgres
Password: SettlePaisa2024
```

## Local Database (Docker)
```
Container: settlepaisa_v2_db
Port: 5433
Database: settlepaisa_v2
Username: postgres
```

## Files Created
- `/tmp/merchant_master_data.sql` - Exported merchant data (15,429 lines)

## Step-by-Step Fix

### Step 1: Find Your EC2 SSH Key
The key name is `sabpaisa-r-and-d.pem`. Search for it:
```bash
# Option 1: Search your entire system
find ~ -name "*sabpaisa*" -name "*.pem" 2>/dev/null
find ~ -name "*r-and-d*" -name "*.pem" 2>/dev/null

# Option 2: Check Downloads
ls ~/Downloads/*.pem

# Option 3: Re-download from AWS Console
# Go to EC2 > Key Pairs > Find sabpaisa-r-and-d
```

### Step 2: Upload Merchant Data to EC2
```bash
# Replace <PATH_TO_KEY> with your actual key file path
scp -i <PATH_TO_KEY> /tmp/merchant_master_data.sql ec2-user@13.201.179.44:~/

# Example:
# scp -i ~/Downloads/sabpaisa-r-and-d.pem /tmp/merchant_master_data.sql ec2-user@13.201.179.44:~/
```

### Step 3: SSH to EC2 and Import Data
```bash
# SSH to EC2
ssh -i <PATH_TO_KEY> ec2-user@13.201.179.44

# Once inside EC2, run these commands:
```

### Step 4: Import Merchant Data to RDS (ON EC2)
```bash
# Import the merchant master data
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f ~/merchant_master_data.sql

# Verify import - should show 15399
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT COUNT(*) FROM sp_v2_merchant_master;"

# Verify MERCH001 exists
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT merchant_id, merchant_name, is_active FROM sp_v2_merchant_master WHERE merchant_id = 'MERCH001';"
```

**Expected Output:**
```
 merchant_id |  merchant_name  | is_active 
-------------+-----------------+-----------
 MERCH001    | Test Merchant 1 | t
```

### Step 5: Update Backend Configuration (ON EC2)
```bash
# Update ecosystem.config.js
sed -i "s/DEFAULT_MERCHANT_ID: '11111111-1111-1111-1111-111111111111'/DEFAULT_MERCHANT_ID: 'MERCH001'/g" ~/ecosystem.config.js

# Verify the change
grep DEFAULT_MERCHANT_ID ~/ecosystem.config.js | head -2

# Should show:
# DEFAULT_MERCHANT_ID: 'MERCH001'
```

### Step 6: Update Service .env Files (ON EC2)
```bash
# Update all service .env files
for dir in ~/services/*/; do
  if [ -f "${dir}.env" ]; then
    sed -i 's/DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111/DEFAULT_MERCHANT_ID=MERCH001/g' "${dir}.env"
    echo "Updated ${dir}.env"
  fi
done
```

**Expected Output:**
```
Updated /home/ec2-user/services/merchant-api/.env
Updated /home/ec2-user/services/overview-api/.env
Updated /home/ec2-user/services/recon-api/.env
Updated /home/ec2-user/services/chargeback-api/.env
Updated /home/ec2-user/services/settlement-analytics-api/.env
Updated /home/ec2-user/services/exports-api/.env
```

### Step 7: Restart Backend Services (ON EC2)
```bash
# Stop all services
pm2 delete all

# Start with new configuration
pm2 start ~/ecosystem.config.js

# Save PM2 configuration
pm2 save

# Check all services are running
pm2 status
```

**Expected Output:**
```
┌─────┬────────────────────────┬─────────┬─────────┐
│ id  │ name                   │ status  │ restart │
├─────┼────────────────────────┼─────────┼─────────┤
│ 0   │ merchant-api           │ online  │ 0       │
│ 1   │ overview-api           │ online  │ 0       │
│ 2   │ recon-api              │ online  │ 0       │
│ 3   │ chargeback-api         │ online  │ 0       │
│ 4   │ settlement-analytics   │ online  │ 0       │
│ 5   │ exports-api            │ online  │ 0       │
│ 6   │ mock-pg-api            │ online  │ 0       │
│ 7   │ mock-bank-api          │ online  │ 0       │
└─────┴────────────────────────┴─────────┴─────────┘
```

### Step 8: Verify Merchant API (ON EC2)
```bash
# Test merchant dashboard endpoint
curl -s http://localhost:8080/v1/merchant/dashboard/summary | jq .

# Test settlements endpoint
curl -s http://localhost:8080/v1/merchant/settlements | jq '.settlements | length'
```

**Expected Output:**
```json
{
  "currentBalance": 24500000,
  "nextSettlementAmount": 8750000,
  "totalTransactions": 205,
  "successRate": 98.5,
  ...
}
```

### Step 9: Verify Merchant Dashboard (From Your Browser)
Open: http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com/merchant/settlements

**You should now see:**
- Current Balance: ₹2.45 Cr (or similar)
- Settlement batches with real data
- 205 transactions for MERCH001
- Settlement history

## Verification Queries

If you need to debug, run these on RDS:

```bash
# Check merchant data exists
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT merchant_id, COUNT(*) as txn_count FROM sp_v2_transactions WHERE merchant_id IN ('MERCH001', 'MERCH002', 'MERCH003') GROUP BY merchant_id ORDER BY merchant_id;"
```

**Expected Output:**
```
 merchant_id | txn_count 
-------------+-----------
 MERCH001    |       205
 MERCH002    |       221
 MERCH003    |       244
```

## Rollback (If Needed)

If something goes wrong:
```bash
# On EC2, revert to old merchant ID
sed -i "s/DEFAULT_MERCHANT_ID: 'MERCH001'/DEFAULT_MERCHANT_ID: '11111111-1111-1111-1111-111111111111'/g" ~/ecosystem.config.js

for dir in ~/services/*/; do
  if [ -f "${dir}.env" ]; then
    sed -i 's/DEFAULT_MERCHANT_ID=MERCH001/DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111/g' "${dir}.env"
  fi
done

pm2 delete all
pm2 start ~/ecosystem.config.js
pm2 save
```

## Quick Reference

**EC2 IP:** 13.201.179.44  
**Merchant Dashboard:** http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com/  
**Ops Dashboard:** http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/  

**Merchant API Port:** 8080  
**Overview API Port:** 5108  
**Recon API Port:** 5103  

**Default Merchant (After Fix):** MERCH001 (Test Merchant 1)  
**Transactions for MERCH001:** 205  
**Transactions for MERCH002:** 221  
**Transactions for MERCH003:** 244  
