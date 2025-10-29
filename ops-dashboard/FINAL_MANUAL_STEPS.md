# Final Manual Steps to Fix Merchant Dashboard

## Current Status ✅
1. ✅ Merchant data (sp_v2_merchant_master) is already in RDS with 15,399 merchants
2. ✅ MERCH001, MERCH002, MERCH003 all exist in RDS
3. ✅ MERCH001 has 205 transactions ready to display
4. ✅ Update script uploaded to S3

## What's Missing
The EC2 backend is still configured with the wrong merchant ID:
- Current: `DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111` ❌
- Should be: `DEFAULT_MERCHANT_ID=MERCH001` ✅

## Option 1: Find Your SSH Key (Fastest)

The SSH key is named `settlepaisa-backend-key.pem`. Check these locations:

```bash
# Search your entire system
find ~ -name "*settlepaisa*backend*.pem" 2>/dev/null
find ~ -name "*backend*key*.pem" 2>/dev/null

# Check Downloads folder
ls -la ~/Downloads/*.pem

# Check if you saved it elsewhere
mdfind "settlepaisa-backend-key"
```

**If you find it:**
```bash
# Make it executable
chmod 400 /path/to/settlepaisa-backend-key.pem

# SSH to EC2
ssh -i /path/to/settlepaisa-backend-key.pem ec2-user@13.201.179.44

# Download and run the update script
aws s3 cp s3://shantanu-settlepaisa-ops-staging/scripts/update-merchant-id.sh ~/update.sh
chmod +x ~/update.sh
~/update.sh
```

## Option 2: Use AWS EC2 Instance Connect (No key needed)

1. Go to AWS Console: https://494253214161.signin.aws.amazon.com/console
2. Login: username `developer`, password `Eminem@12345`
3. Navigate to: **EC2** → **Instances** → Select instance `i-08ac67ac776d4ab23`
4. Click: **Connect** button (top right)
5. Choose: **EC2 Instance Connect** tab
6. Click: **Connect**

**Then run these commands in the browser terminal:**

```bash
# Download the update script from S3
aws s3 cp s3://shantanu-settlepaisa-ops-staging/scripts/update-merchant-id.sh ~/update.sh

# Make it executable
chmod +x ~/update.sh

# Run it
~/update.sh
```

## Option 3: Manual Commands (Copy-Paste)

If EC2 Instance Connect doesn't work, manually SSH and run:

```bash
# Update ecosystem.config.js
sed -i "s/DEFAULT_MERCHANT_ID: '11111111-1111-1111-1111-111111111111'/DEFAULT_MERCHANT_ID: 'MERCH001'/g" ~/ecosystem.config.js

# Update all service .env files
for dir in ~/services/*/; do
  if [ -f "${dir}.env" ]; then
    sed -i 's/DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111/DEFAULT_MERCHANT_ID=MERCH001/g' "${dir}.env"
    echo "Updated ${dir}.env"
  fi
done

# Restart PM2
pm2 delete all
pm2 start ~/ecosystem.config.js
pm2 save

# Verify
pm2 status

# Test the API
curl http://localhost:8080/v1/merchant/dashboard/summary
```

## Verification

After running the update, test these:

### 1. Check Merchant API on EC2
```bash
curl -s http://localhost:8080/v1/merchant/dashboard/summary | jq .
```

**Expected Output:**
```json
{
  "currentBalance": 24500000,
  "nextSettlementAmount": 8750000,
  "totalTransactions": 205,
  "successRate": 98.5
}
```

### 2. Check Merchant Dashboard in Browser
Open: http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com/merchant/settlements

**You should see:**
- ✅ Current Balance: ₹2.45 Cr (not ₹-)
- ✅ Settlement batches with real data
- ✅ 205 transactions for MERCH001
- ✅ Settlement history populated

### 3. Check Settlement Batches
```bash
curl -s http://localhost:8080/v1/merchant/settlements | jq '.settlements | length'
```

Should return a number > 0 (not 0 or null)

## Database Verification (If Needed)

Connect to RDS to verify data:

```bash
PGPASSWORD='SettlePaisa2024' psql \
  -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -c "SELECT merchant_id, merchant_name, is_active FROM sp_v2_merchant_master WHERE merchant_id = 'MERCH001';"
```

**Expected:**
```
 merchant_id |  merchant_name  | is_active 
-------------+-----------------+-----------
 MERCH001    | Test Merchant 1 | t
```

## If Something Goes Wrong

### Rollback to UUID
```bash
sed -i "s/DEFAULT_MERCHANT_ID: 'MERCH001'/DEFAULT_MERCHANT_ID: '11111111-1111-1111-1111-111111111111'/g" ~/ecosystem.config.js

for dir in ~/services/*/; do
  if [ -f "${dir}.env" ]; then
    sed -i 's/DEFAULT_MERCHANT_ID=MERCH001/DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111/g' "${dir}.env"
  fi
done

pm2 delete all && pm2 start ~/ecosystem.config.js && pm2 save
```

### Check PM2 Logs
```bash
pm2 logs merchant-api --lines 50
```

### Check Service Status
```bash
pm2 status
systemctl status pm2-ec2-user  # If PM2 is managed by systemd
```

## Quick Reference

**EC2 Instance:**
- ID: `i-08ac67ac776d4ab23`
- IP: `13.201.179.44`
- Key: `settlepaisa-backend-key.pem`

**RDS Database:**
- Endpoint: `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432`
- Database: `settlepaisa_v2`
- User: `postgres`
- Password: `SettlePaisa2024`

**Dashboards:**
- Merchant: http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com/
- Ops: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/

**Merchants in Database:**
- MERCH001 (205 transactions) ← Default after fix
- MERCH002 (221 transactions)
- MERCH003 (244 transactions)

**AWS Console:**
- URL: https://494253214161.signin.aws.amazon.com/console
- Username: developer
- Password: Eminem@12345

**Script Location:**
- S3: s3://shantanu-settlepaisa-ops-staging/scripts/update-merchant-id.sh
- Local: /tmp/update-merchant-id.sh
