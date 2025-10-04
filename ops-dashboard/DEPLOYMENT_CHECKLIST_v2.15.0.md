# Deployment Checklist - Version 2.15.0
## PG Auto-Sync with Automated Daily Batch Job

**Target Environment:** Production  
**Deployment Date:** TBD  
**Deployed By:** __________  
**Approved By:** __________  

---

## Pre-Deployment

### 1. Code Review
- [ ] All changes reviewed in PR
- [ ] Unit tests passed
- [ ] Integration tests passed
- [ ] No breaking changes identified
- [ ] Security scan completed

### 2. Backup
- [ ] Database backup taken
- [ ] Current version tagged in git
- [ ] Rollback plan documented

### 3. Dependencies
- [ ] `node-cron@3.0.3` available in npm registry
- [ ] `node-fetch@2.7.0` available in npm registry
- [ ] PostgreSQL 15 running
- [ ] Docker containers healthy

---

## Deployment Steps

### Phase 1: Database Migration

#### Step 1.1: Apply Migration 015 (API_SYNC source type)
```bash
psql -U postgres -d settlepaisa_v2 -f db/migrations/015_add_api_sync_source_type.sql
```

**Verification:**
```sql
\d sp_v2_transactions
-- Check constraint should include 'API_SYNC'
```

- [ ] Migration 015 applied successfully
- [ ] Constraint verification passed

#### Step 1.2: Apply Migration 016 (Batch job logs table)
```bash
psql -U postgres -d settlepaisa_v2 -f db/migrations/016_batch_job_logs.sql
```

**Verification:**
```sql
\d sp_v2_batch_job_logs
-- Table should exist with all columns
```

- [ ] Migration 016 applied successfully
- [ ] Table verification passed

### Phase 2: Backend Deployment

#### Step 2.1: Install Dependencies
```bash
cd /path/to/ops-dashboard/services/recon-api
npm install
```

**Expected:**
- node-cron@3.0.3 installed
- node-fetch@2.7.0 installed

- [ ] Dependencies installed successfully
- [ ] No vulnerability warnings

#### Step 2.2: Configure Environment Variables
```bash
# Add to .env or production config
export MERCHANT_CODES="MERCHANT001,MERCHANT002,MERCHANT003"
# OR
export MERCHANT_CODES="ALL"
```

- [ ] Environment variables configured
- [ ] Merchant codes verified with business team

#### Step 2.3: Configure SabPaisa API Credentials

**File:** `services/recon-api/services/pg-sync-service.js` (line 17-21)

**Action Required:**
1. Get API credentials from SabPaisa team
2. Update fetch call with authentication headers
3. Test API call manually

```bash
# Test API call
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/2025-10-01/2025-10-01/MERCHANT001
```

- [ ] API credentials obtained
- [ ] Credentials configured in code
- [ ] Manual API test successful
- [ ] Returns valid JSON with transactions

#### Step 2.4: Restart Recon API Server
```bash
# Stop current server
pm2 stop recon-api
# OR
systemctl stop recon-api

# Start with new code
pm2 start recon-api
# OR
systemctl start recon-api
```

**Verify startup logs:**
```bash
pm2 logs recon-api --lines 50
# OR
journalctl -u recon-api -n 50

# Should see:
# Reconciliation API running on port 5103
# [Daily PG Sync] Scheduling cron job: Every day at 2:00 AM
# [Daily PG Sync] ✓ Cron job scheduled successfully
```

- [ ] Server restarted successfully
- [ ] Cron job scheduled (logs confirm)
- [ ] No error messages in logs
- [ ] Health check endpoint responds

### Phase 3: Frontend Deployment

#### Step 3.1: Build Frontend
```bash
cd /path/to/ops-dashboard
npm run build
```

- [ ] Build completed without errors
- [ ] No TypeScript errors
- [ ] Bundle size acceptable

#### Step 3.2: Deploy Frontend Assets
```bash
# Copy build to production server
scp -r dist/* user@prod-server:/var/www/ops-dashboard/

# OR if using Docker
docker build -t ops-dashboard:v2.15.0 .
docker tag ops-dashboard:v2.15.0 prod-registry/ops-dashboard:latest
docker push prod-registry/ops-dashboard:latest
```

- [ ] Frontend deployed successfully
- [ ] Assets accessible via browser
- [ ] No 404 errors in console

---

## Post-Deployment Verification

### 1. Smoke Tests

#### Test 1: Health Check
```bash
curl http://prod-server:5103/recon/health
```

**Expected:** `{"status": "ok"}`

- [ ] Health check returns 200 OK

#### Test 2: PG Transactions Check Endpoint
```bash
curl "http://prod-server:5103/pg-transactions/check?cycle_date=2025-10-01"
```

**Expected:** JSON with `success: true`

- [ ] Check endpoint works
- [ ] Returns valid JSON

#### Test 3: Manual Sync Test
```bash
curl -X POST http://prod-server:5103/pg-transactions/sync/manual \
  -H "Content-Type: application/json" \
  -d '{"cycle_date": "2025-10-01", "merchant_codes": ["MERCHANT001"]}'
```

**Expected:** JSON with sync results

- [ ] Manual sync endpoint works
- [ ] Transactions synced (count > 0)
- [ ] No 401 errors
- [ ] Data persisted to database

#### Test 4: Verify Batch Job Logs
```sql
SELECT * FROM sp_v2_batch_job_logs 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Expected:** At least 1 row from manual sync test

- [ ] Logs table has entries
- [ ] Status is correct
- [ ] Transaction counts match

### 2. UI Verification

#### Test 5: Open Manual Upload Page
**URL:** `https://prod-server/ops/recon`

- [ ] Page loads without errors
- [ ] "Fetch from Database" button visible
- [ ] No console errors

#### Test 6: Test PG Fetch Button
1. Select cycle date
2. Click "Fetch from Database"
3. Verify status message

**Expected:**
- Loading spinner appears
- Success message shows transaction count
- Source badge shows "From API Sync" or "From Database"

- [ ] Button click works
- [ ] Loading state shows
- [ ] Success message appears
- [ ] Transaction count displayed

#### Test 7: Test Manual Upload Still Works
1. Upload PG CSV file
2. Upload Bank CSV file
3. Run reconciliation

- [ ] CSV upload works
- [ ] Both files accepted
- [ ] Reconciliation runs
- [ ] Results displayed

### 3. Integration Tests

#### Test 8: Full Workflow (API Sync + Bank Upload)
1. Fetch PG data from database (API-synced)
2. Upload bank file
3. Run reconciliation
4. Check results

**Expected:**
- Reconciliation completes
- Matched/exceptions shown
- Overview tiles update

- [ ] Full workflow successful
- [ ] Results accurate
- [ ] No errors in logs

#### Test 9: Verify Deduplication
1. Fetch PG data (API sync)
2. Upload same transactions via CSV
3. Check database

**Expected:**
- No duplicate transaction_id rows
- API_SYNC data preserved
- Manual data ignored for duplicates

```sql
SELECT transaction_id, COUNT(*) 
FROM sp_v2_transactions 
GROUP BY transaction_id 
HAVING COUNT(*) > 1;
```

**Should return:** 0 rows

- [ ] No duplicate transactions
- [ ] API_SYNC data not overwritten

#### Test 10: Check Overview Page
**URL:** `https://prod-server/ops/overview`

- [ ] Overview tiles load
- [ ] KPIs display correctly
- [ ] No JavaScript errors
- [ ] Charts render

### 4. Monitoring Setup

#### Monitor 1: Cron Job Execution
Set up alert for failed batch jobs:

```sql
SELECT * FROM sp_v2_batch_job_logs 
WHERE job_type = 'DAILY_PG_SYNC'
  AND status IN ('FAILED', 'PARTIAL_SUCCESS')
  AND created_at > NOW() - INTERVAL '1 day';
```

- [ ] Alert configured
- [ ] Test alert triggers correctly

#### Monitor 2: API Failures
Track 401/500 errors from SabPaisa API:

```bash
grep "Error fetching from SabPaisa API" /var/log/recon-api.log
```

- [ ] Log monitoring configured
- [ ] Alerts set up for errors

#### Monitor 3: Zero Transactions Synced
Alert if batch job syncs 0 transactions (possible issue):

```sql
SELECT * FROM sp_v2_batch_job_logs 
WHERE total_transactions_synced = 0
  AND created_at > NOW() - INTERVAL '1 day';
```

- [ ] Alert configured
- [ ] Business team notified of alert

---

## Rollback Plan

### If Critical Issues Found:

#### Step 1: Revert Code
```bash
cd /path/to/ops-dashboard
git revert a45d189
git push origin main
```

#### Step 2: Restart Services
```bash
pm2 restart recon-api
npm run build && deploy
```

#### Step 3: Revert Migrations (if needed)
```sql
-- Revert Migration 016
DROP TABLE IF EXISTS sp_v2_batch_job_logs;

-- Revert Migration 015
ALTER TABLE sp_v2_transactions 
DROP CONSTRAINT sp_v2_transactions_source_type_check;

ALTER TABLE sp_v2_transactions 
ADD CONSTRAINT sp_v2_transactions_source_type_check 
CHECK (source_type IN ('MANUAL_UPLOAD', 'CONNECTOR'));
```

- [ ] Rollback plan documented
- [ ] Team knows rollback procedure

---

## Post-Deployment Actions

### Day 1 (Deployment Day)
- [ ] Monitor logs for 4 hours
- [ ] Check batch job logs at 2:00 AM (if deployed before)
- [ ] Verify no user-reported issues
- [ ] Update deployment log

### Day 2 (Next Day)
- [ ] Check batch job ran at 2:00 AM
- [ ] Verify transactions synced successfully
- [ ] Check batch job logs table
- [ ] Confirm users see synced data at 9:00 AM

### Week 1
- [ ] Monitor batch job success rate
- [ ] Track API failure patterns
- [ ] Collect user feedback
- [ ] Document any issues

### Week 2
- [ ] Review batch job performance metrics
- [ ] Optimize if needed
- [ ] Update documentation
- [ ] Schedule retrospective

---

## Sign-Off

### Pre-Deployment
- [ ] Development Team Lead: __________ Date: ______
- [ ] QA Lead: __________ Date: ______
- [ ] DevOps Lead: __________ Date: ______

### Post-Deployment
- [ ] Production Verification: __________ Date: ______
- [ ] Business Approval: __________ Date: ______
- [ ] Go-Live Confirmed: __________ Date: ______

---

## Notes & Issues

**Pre-Deployment:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

**During Deployment:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

**Post-Deployment:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

---

**Deployment Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Completed | ⬜ Rolled Back

**Final Sign-Off:** __________ Date: ______
