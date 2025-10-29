# Deploy "Fetch from Database" Fix to Staging

**Date:** 2025-10-26  
**Fix:** Database connection configuration in pg-sync-service.js  
**Impact:** Enables automated transaction fetching from SabPaisa platform

---

## 📦 Deployment Package

**File:** `pg-sync-fix.tar.gz`  
**Contents:**
- `services/recon-api/services/pg-sync-service.js` (fixed file)
- `FETCH_FROM_DATABASE_ISSUE_ANALYSIS.md` (issue documentation)

---

## 🚀 Deployment Steps

### Option A: Manual Deployment (If you have SSH access)

```bash
# 1. Upload to EC2
scp pg-sync-fix.tar.gz ubuntu@13.201.179.44:/home/ubuntu/

# 2. SSH into EC2
ssh ubuntu@13.201.179.44

# 3. Extract and backup
cd /home/ubuntu
tar -xzf pg-sync-fix.tar.gz

# 4. Backup current file
cd ops-dashboard/services/recon-api/services
cp pg-sync-service.js pg-sync-service.js.backup-$(date +%Y%m%d-%H%M%S)

# 5. Copy new file
cp /home/ubuntu/services/recon-api/services/pg-sync-service.js .

# 6. Restart Recon API
pm2 restart recon-api
# OR
sudo systemctl restart recon-api

# 7. Verify service started
pm2 logs recon-api --lines 20
```

### Option B: Direct File Edit (If you have console access)

```bash
# SSH into EC2
ssh ubuntu@13.201.179.44

# Edit file
cd /home/ubuntu/ops-dashboard/services/recon-api/services
nano pg-sync-service.js

# Change lines 5-11 from:
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

# To:
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  database: process.env.DB_NAME || 'settlepaisa_v2'
});

# Save and restart
pm2 restart recon-api
```

---

## ✅ Verification Steps

### Test 1: Check Service Logs
```bash
pm2 logs recon-api --lines 50
# Should NOT show "ECONNREFUSED" errors
```

### Test 2: Test API Endpoint
```bash
curl 'http://localhost:5103/pg-transactions/fetch?cycle_date=2025-10-24'

# Expected (if no data): 
# {"success":true,"count":0,"message":"No transactions found..."}

# Expected (if data exists):
# {"success":true,"count":X,"transactions":[...],"source_breakdown":{...}}
```

### Test 3: Test from Outside
```bash
# From your local machine
curl 'http://13.201.179.44:5103/pg-transactions/fetch?cycle_date=2025-10-24'

# Should NOT return: {"success":false,"error":"connect ECONNREFUSED 127.0.0.1:5433"}
```

### Test 4: Test from Frontend
1. Open staging dashboard: https://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/
2. Navigate to Recon Workspace
3. Select cycle date: 2025-10-24
4. Click **"Fetch from Database"** button
5. **Expected:** Should show loading spinner, then success message
6. **Not expected:** Should NOT show error about localhost:5433

---

## 📊 Expected Behavior After Fix

### Scenario 1: Fresh Fetch (No existing data)
```
User clicks "Fetch from Database"
         ↓
Backend calls SabPaisa API: https://reportapi.sabpaisa.in/...
         ↓
Receives transactions from SabPaisa
         ↓
Inserts into sp_v2_transactions
         ↓
Returns: "✓ 500 transactions (From Database)"
```

### Scenario 2: Already Synced
```
User clicks "Fetch from Database"
         ↓
Backend checks sp_v2_transactions
         ↓
Finds existing API_SYNC data
         ↓
Returns immediately: "✓ 500 transactions already available"
```

---

## 🐛 Troubleshooting

### If service won't restart:
```bash
# Check for syntax errors
cd /home/ubuntu/ops-dashboard/services/recon-api/services
node -c pg-sync-service.js

# If error, restore backup
cp pg-sync-service.js.backup-YYYYMMDD-HHMMSS pg-sync-service.js
pm2 restart recon-api
```

### If still getting localhost:5433 error:
```bash
# Check environment variables
pm2 env recon-api | grep DB_

# Should show:
# DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
# DB_PORT=5432
# DB_USER=settlepaisa_user
# DB_PASSWORD=settlepaisa_password
# DB_NAME=settlepaisa_v2

# If not set, add to PM2 ecosystem file or .env
```

### If SabPaisa API call fails:
```bash
# Check API mode
pm2 env recon-api | grep SABPAISA_API_MODE

# For production, should be 'direct' (default) or not set
# Test SabPaisa API manually:
curl 'https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/2025-10-24/2025-10-24/ALL'
```

---

## 📋 Rollback Plan

If deployment fails:

```bash
# Restore backup
cd /home/ubuntu/ops-dashboard/services/recon-api/services
cp pg-sync-service.js.backup-YYYYMMDD-HHMMSS pg-sync-service.js

# Restart service
pm2 restart recon-api

# Verify rollback
curl 'http://localhost:5103/health'
```

---

## ✅ Success Criteria

- [ ] Service restarts without errors
- [ ] No "ECONNREFUSED" errors in logs
- [ ] `/pg-transactions/fetch` endpoint returns success (not 500 error)
- [ ] Frontend "Fetch from Database" button works
- [ ] Transactions are fetched from SabPaisa and inserted into database

---

**Fix Deployed:** _______________  
**Deployed By:** _______________  
**Verification Status:** ⬜ Success ⬜ Failed ⬜ Rolled Back  
**Notes:** _______________
