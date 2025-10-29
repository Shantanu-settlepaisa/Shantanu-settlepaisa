# Manual Deployment Guide - Date Filter Consistency Fix to AWS Staging

## Date: 2025-10-12
## Commit: aed5d91
## Fix: Dashboard date filter consistency using reconciliation date

---

## 🚨 SSH ACCESS ISSUE IDENTIFIED

**Problem**: Local SSH key fingerprint mismatch
- **Local key fingerprint**: `fb:7b:3b:7e:76:1e:4a:0a:78:d6:f0:82:0c:b9:b8:75`
- **EC2 instance key fingerprint**: `09:a4:9f:52:40:53:60:14:52:d7:30:a8:93:c6:88:4a:76:7a:13:30`
- **Instance key pair name**: `settlepaisa-backend-key`
- **Result**: Cannot SSH to staging server from local machine

**SSM Status**: SSM agent not running on instance (cannot use Session Manager)

---

## 📋 MANUAL DEPLOYMENT STEPS

### Option 1: Deploy via AWS Console (EC2 Instance Connect)

1. **Access Instance via AWS Console**
   - Go to AWS Console → EC2 → Instances
   - Select instance `i-08ac67ac776d4ab23`
   - Click "Connect" → "EC2 Instance Connect"
   - Click "Connect" button

2. **Execute Deployment Commands**
   ```bash
   # Step 1: Navigate to project directory
   cd ~/ops-dashboard

   # Step 2: Check current branch
   git branch --show-current

   # Step 3: Fetch latest changes
   git fetch origin feat/ops-dashboard-exports

   # Step 4: Pull the date filter fix (commit aed5d91)
   git pull origin feat/ops-dashboard-exports

   # Step 5: Verify the new file exists
   ls -la services/overview-api/real-db-adapter.cjs

   # Step 6: Check PM2 process list
   pm2 list

   # Step 7: Restart Overview API service
   pm2 restart overview-api

   # Step 8: Check logs for errors
   pm2 logs overview-api --lines 30

   # Step 9: Test the API endpoint
   curl "http://localhost:5108/api/ops/overview?from=2025-10-12&to=2025-10-12"
   ```

3. **Expected Results**
   - Git pull should show: `services/overview-api/real-db-adapter.cjs` downloaded
   - PM2 restart should show: `overview-api` restarted successfully
   - Logs should show: `[Real DB] Fetching KPIs from 2025-10-12 to 2025-10-12`
   - API test should return JSON with `pipeline.totalCaptured` > 0

---

### Option 2: Deploy via Correct SSH Key

If you have the correct SSH key with fingerprint `09:a4:9f:52:40:53:60:14:52:d7:30:a8:93:c6:88:4a:76:7a:13:30`:

```bash
# Use your correct key file
ssh -i /path/to/correct/settlepaisa-backend-key.pem ec2-user@13.201.179.44

# Then run the same commands as Option 1, steps 2-9
```

---

## 📦 WHAT GETS DEPLOYED

### Files Changed
1. **services/overview-api/real-db-adapter.cjs** (NEW - 423 lines)
   - Database query adapter for dashboard
   - Changes: Uses `created_at` for date filtering (reconciliation date)
   - Impact: Settlement Pipeline and Reconciliation Sources will show data

2. **DATE_FILTER_CONSISTENCY_FIX.md** (NEW - 376 lines)
   - Documentation only, no deployment needed

### Services Affected
- **Overview API (Port 5108)**: Needs restart ✅
- **Recon API (Port 5103)**: No changes ✅
- **Frontend (Port 5174)**: No changes ✅
- **Database**: No schema changes ✅

---

## ✅ VERIFICATION CHECKLIST

After deployment, verify the following:

### 1. Service Health
```bash
pm2 list
# Should show: overview-api | online | 0 | 0s | 0 restarts
```

### 2. API Response - Today Filter
```bash
curl "http://localhost:5108/api/ops/overview?from=2025-10-12&to=2025-10-12"
```
**Expected**:
```json
{
  "tiles": {
    "matched": 10,
    "total": 12,
    "pct": 83
  },
  "pipeline": {
    "totalCaptured": 12,  ← Should NOT be 0
    "raw": {
      "inSettlement": 10,
      "sentToBank": 0,
      "creditedUtr": 0
    }
  },
  "bySource": {
    "manual": {
      "total": 2,  ← Should NOT be 0
      "matched": 0,
      "pct": 0
    },
    "connector": {
      "total": 10,  ← Should NOT be 0
      "matched": 10,
      "pct": 100
    }
  }
}
```

### 3. API Response - Last 7 Days
```bash
curl "http://localhost:5108/api/ops/overview?from=2025-10-05&to=2025-10-12"
```
**Expected**:
```json
{
  "pipeline": {
    "totalCaptured": 50  ← Should show data
  },
  "bySource": {
    "connector": {
      "total": 45,  ← Should show data
      "pct": 64.44
    }
  }
}
```

### 4. Dashboard UI
Open: `http://13.201.179.44:5174/ops/overview`

**Check**:
- ✅ Settlement Pipeline shows captured count (not 0)
- ✅ Reconciliation Sources shows percentages (not 0%)
- ✅ KPI tiles remain consistent
- ✅ No console errors

---

## 🔧 TROUBLESHOOTING

### Issue: PM2 process not found
```bash
# List all processes
pm2 list

# If overview-api not found, check start script
cd ~/ops-dashboard/services/overview-api
pm2 start index.cjs --name overview-api

# Save PM2 config
pm2 save
```

### Issue: Git pull shows conflicts
```bash
# Check git status
git status

# If conflicts, stash local changes
git stash

# Pull again
git pull origin feat/ops-dashboard-exports

# Reapply stashed changes if needed
git stash pop
```

### Issue: API returns errors
```bash
# Check logs in detail
pm2 logs overview-api --lines 100

# Restart with fresh logs
pm2 restart overview-api
pm2 flush
pm2 logs overview-api
```

### Issue: Database connection error
```bash
# Check database connectivity
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres \
     -d settlepaisa_v2 \
     -c "SELECT COUNT(*) FROM sp_v2_transactions;"

# If connection fails, check environment variables
echo $DATABASE_HOST
echo $DATABASE_PORT
```

---

## 🔄 ROLLBACK PLAN

If issues arise after deployment:

```bash
# Step 1: Go to previous commit
cd ~/ops-dashboard
git log --oneline -5
git reset --hard <previous-commit-hash>

# Step 2: Restart service
pm2 restart overview-api

# Step 3: Verify rollback
curl "http://localhost:5108/api/ops/overview?from=2025-10-12&to=2025-10-12"
```

---

## 📊 EXPECTED BEHAVIOR AFTER DEPLOYMENT

### Before Fix
| Component | "Today" Filter | "Last 7 Days" Filter |
|-----------|----------------|----------------------|
| KPI Tiles | 12 transactions ✅ | 12 transactions ✅ |
| Settlement Pipeline | 0 transactions ❌ | 50 transactions ✅ |
| Reconciliation Sources | 0% / 0% ❌ | 64% / 0% ✅ |

### After Fix
| Component | "Today" Filter | "Last 7 Days" Filter |
|-----------|----------------|----------------------|
| KPI Tiles | 12 transactions ✅ | 12 transactions ✅ |
| Settlement Pipeline | 12 transactions ✅ | 50 transactions ✅ |
| Reconciliation Sources | 100% / 0% ✅ | 64% / 0% ✅ |

---

## 🎯 SUCCESS CRITERIA

- ✅ Git pull successful (commit aed5d91)
- ✅ PM2 restart successful (overview-api online)
- ✅ API responds without errors
- ✅ Settlement Pipeline shows data for "Today" filter
- ✅ Reconciliation Sources shows data for "Today" filter
- ✅ Dashboard UI displays consistent data
- ✅ No errors in PM2 logs

---

## 📝 POST-DEPLOYMENT NOTES

After successful deployment, document:

1. **Deployment Time**: _________
2. **Deployed By**: _________
3. **Verification Status**: _________
4. **Any Issues Encountered**: _________
5. **Dashboard Performance**: _________

---

## 🔑 SSH KEY RESOLUTION

To prevent future deployment issues:

### Option A: Download Correct Key from AWS
```bash
# Cannot directly download private key from AWS
# Key must be downloaded when it was first created
# Check with team members who created the instance on 2025-10-06
```

### Option B: Update EC2 Instance with Local Key
```bash
# Add local key to authorized_keys
# 1. Access instance via AWS Console (EC2 Instance Connect)
# 2. Add your public key:
echo "ssh-rsa AAAAB3NzaC1yc2E... settlepaisa-access" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 3. Test from local machine:
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44
```

### Option C: Enable SSM Session Manager
```bash
# Install SSM agent on EC2 instance
# 1. Access instance via AWS Console
# 2. Install agent:
sudo yum install -y amazon-ssm-agent
sudo systemctl enable amazon-ssm-agent
sudo systemctl start amazon-ssm-agent

# 3. Verify from local machine:
aws ssm start-session --target i-08ac67ac776d4ab23 --region ap-south-1
```

---

**Status**: Ready for manual deployment
**Priority**: HIGH (critical bug fix)
**Risk Level**: LOW (isolated change, easy rollback)
**Estimated Time**: 5 minutes

---

**Next Steps**:
1. Execute deployment via AWS Console (Option 1) ✅
2. Run verification checklist ✅
3. Confirm dashboard displays data ✅
4. Document deployment completion ✅
