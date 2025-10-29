# Deploy Tax Report Endpoint to Staging 1 - Manual Steps

**Date:** 2025-10-25
**Target:** EC2 Instance 13.201.179.44:5108
**File to Deploy:** `services/overview-api/index.js`

---

## 📋 Pre-Deployment Checklist

- ✅ Tax report endpoint implemented locally
- ✅ Tested on localhost (all tests passed)
- ✅ Tax data verified in staging database
- ⏳ Ready to deploy to EC2

---

## 🚀 Deployment Steps

### Step 1: SSH into EC2 Instance

```bash
ssh ubuntu@13.201.179.44
# OR if using key file:
ssh -i /path/to/your-key.pem ubuntu@13.201.179.44
```

### Step 2: Navigate to Project Directory

```bash
cd /home/ubuntu/ops-dashboard/services/overview-api
```

### Step 3: Backup Current File

```bash
# Create timestamped backup
cp index.js index.js.backup-$(date +%Y%m%d-%H%M%S)

# Verify backup created
ls -lh index.js*
```

### Step 4: Upload Updated File from Local

**On your LOCAL machine** (in a new terminal):

```bash
# From ops-dashboard directory
scp services/overview-api/index.js ubuntu@13.201.179.44:/home/ubuntu/ops-dashboard/services/overview-api/index.js

# OR if using key file:
scp -i /path/to/your-key.pem services/overview-api/index.js ubuntu@13.201.179.44:/home/ubuntu/ops-dashboard/services/overview-api/index.js
```

### Step 5: Verify File Uploaded

**Back on EC2:**

```bash
# Check file size and timestamp
ls -lh index.js

# Quick grep to verify tax-report endpoint exists
grep "api/reports/tax-report" index.js
# Should output: app.get('/api/reports/tax-report', async (req, res) => {
```

### Step 6: Restart Overview API Service

```bash
# If using PM2:
pm2 restart overview-api

# OR if using systemd:
sudo systemctl restart overview-api

# OR if manual node process:
pkill -f "node.*overview-api"
cd /home/ubuntu/ops-dashboard/services/overview-api
nohup node index.js > logs/overview-api.log 2>&1 &
```

### Step 7: Verify Service Restarted

```bash
# Check if process is running
ps aux | grep "overview-api"

# Check logs for any errors
tail -f logs/overview-api.log
# OR
pm2 logs overview-api --lines 20
```

### Step 8: Test the Endpoint

```bash
# Test tax-report endpoint
curl 'http://localhost:5108/api/reports/tax-report?merchant_id=MERCH001'

# Expected output: JSON with tax data
# Look for: "success":true, "count":18, "reports":[...]
```

---

## ✅ Verification Checklist

### Backend Verification (on EC2):

- [ ] File uploaded successfully
- [ ] Backup created
- [ ] Service restarted without errors
- [ ] Process is running (ps aux shows node process)
- [ ] Endpoint returns 200 OK (not 404)
- [ ] Response contains tax data with GST

### External API Test:

```bash
# From your local machine:
curl 'http://13.201.179.44:5108/api/reports/tax-report?merchant_id=MERCH001'

# Expected: JSON response with tax data
```

### Frontend Test:

1. Open: https://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/reports
2. Click **"Tax Report"** tab
3. Should load table with tax data (not 404 error)
4. Verify columns: Date, Merchant, Gross Amount, Commission, GST, Invoice #

---

## 🔍 Troubleshooting

### If endpoint returns 404:

```bash
# Check if service is actually running
pm2 list
# OR
ps aux | grep overview-api

# Check logs for errors
pm2 logs overview-api
# OR
tail -50 logs/overview-api.log
```

### If service won't start:

```bash
# Check for syntax errors
node -c index.js

# Try starting manually to see error
cd /home/ubuntu/ops-dashboard/services/overview-api
node index.js
# (Ctrl+C to stop, then restart with pm2/systemd)
```

### If deployment fails, rollback:

```bash
# Restore from backup
cp index.js.backup-YYYYMMDD-HHMMSS index.js

# Restart service
pm2 restart overview-api
```

---

## 📊 Expected Results

### Successful Deployment:

```json
{
  "success": true,
  "count": 18,
  "reports": [
    {
      "cycle_date": "2025-10-24T00:00:00.000Z",
      "merchant_id": "MERCH001",
      "merchant_name": "Merchant MERCH001",
      "gross_amount_paise": "110000000",
      "commission_paise": "2200000",
      "gst_rate_pct": "18.0",
      "gst_amount_paise": "396000",
      "tds_rate_pct": "2.0",
      "tds_amount_paise": 0,
      "invoice_number": "INV-897da717",
      "pan": "AAACR1234M",
      "gstin": "12AAACR1234M1Z5",
      "status": "PENDING_APPROVAL"
    }
  ],
  "timestamp": "2025-10-25T..."
}
```

### Tax Data Validation:

```
✅ Commission: ₹22,000 (2,200,000 paise)
✅ GST (18%): ₹3,960 (396,000 paise)
✅ Calculation: 2,200,000 × 0.18 = 396,000 ✅ CORRECT
```

---

## 🎯 Post-Deployment Actions

1. **Monitor logs for 10 minutes:**
   ```bash
   pm2 logs overview-api --lines 50
   ```

2. **Test all report types still work:**
   - Settlement Summary
   - Bank MIS
   - Recon Outcome
   - Settlement Transactions
   - **Tax Report** (new)

3. **Check no regressions:**
   ```bash
   # Test existing endpoints
   curl http://13.201.179.44:5108/api/reports/settlements
   curl http://13.201.179.44:5108/api/reports/bank-mis?merchant_id=MERCH001
   ```

4. **Document deployment:**
   - Update deployment log
   - Note any issues encountered
   - Verify frontend works

---

## 📝 Deployment Record

**Deployed by:** _______________
**Date/Time:** _______________
**Deployment Status:** ⬜ Success ⬜ Failed ⬜ Rolled Back
**Issues Encountered:** _______________
**Notes:** _______________

---

## 🔄 Alternative: Quick Deployment Script

If you prefer, save this as `deploy-tax-report.sh` on EC2:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying Tax Report Endpoint..."

# Backup
cp index.js index.js.backup-$(date +%Y%m%d-%H%M%S)
echo "✅ Backup created"

# Upload would happen via scp before running this script

# Restart service
pm2 restart overview-api
echo "✅ Service restarted"

# Wait for service to be ready
sleep 3

# Test endpoint
RESPONSE=$(curl -s 'http://localhost:5108/api/reports/tax-report?merchant_id=MERCH001')
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Tax Report endpoint is working!"
  echo "📊 Found $(echo "$RESPONSE" | jq -r '.count') tax reports"
else
  echo "❌ Tax Report endpoint failed!"
  echo "$RESPONSE"
  exit 1
fi

echo "🎉 Deployment complete!"
```

---

**Ready to deploy! Follow the steps above and let me know if you encounter any issues.**
