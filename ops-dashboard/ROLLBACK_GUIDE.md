# Rollback Guide - SettlePaisa Dashboard

This guide explains how to rollback to **Version 2.22.0** or any previous stable version.

---

## Quick Rollback Commands

### **Scenario 1: Rollback to Version 2.22.0 (Merchant Dashboard V2 Integration)**

```bash
# 1. Go to ops-dashboard directory
cd /Users/shantanusingh/ops-dashboard

# 2. Check current version
git log --oneline -1

# 3. Rollback to Version 2.22.0
git checkout 9208ec0

# 4. Install dependencies (if package.json changed)
npm install

# 5. Rebuild frontend
npm run build

# 6. Restart services
# Stop current services
pkill -f "node.*merchant-api"
pkill -f "node.*overview-api"

# Start services at Version 2.22.0
cd services/merchant-api
USE_DB=true PG_URL="postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2" \
DEFAULT_MERCHANT_ID="MERCH001" node index.js > /tmp/merchant-api.log 2>&1 &

# 7. Start frontend
npm run dev -- --port 5174

# Done! You're now on Version 2.22.0
```

**What You Get:**
- ✅ Merchant Dashboard with V2 database integration
- ✅ Ops Dashboard with all features
- ❌ No deployment flexibility (both dashboards always enabled)

---

### **Scenario 2: Rollback to Version 2.21.0 (Before Merchant Integration)**

```bash
# Rollback to before merchant dashboard V2 integration
git checkout efbe72c

# Rebuild
npm install
npm run build

# Restart services
# (same as above)
```

**What You Get:**
- ✅ Ops Dashboard fully working
- ⚠️  Merchant Dashboard on **mock data** (not V2 database)

---

### **Scenario 3: Return to Latest Version**

```bash
# Return to the latest code on current branch
git checkout feat/ops-dashboard-exports

# Pull latest changes
git pull origin feat/ops-dashboard-exports

# Rebuild
npm install
npm run build

# Restart services
```

---

## Detailed Rollback Procedures

### **Method 1: Temporary Rollback (Testing Only)**

Use this when you want to test an old version but keep current changes.

```bash
# 1. Detach HEAD to specific version
git checkout 9208ec0

# You'll see:
# "You are in 'detached HEAD' state"
# This is NORMAL for testing old versions

# 2. Test the version
npm run dev

# 3. When done testing, return to current branch
git checkout feat/ops-dashboard-exports
```

**Important:** 
- Changes made in detached HEAD state will be LOST unless you create a branch
- This is for **testing only**, not for deployment

---

### **Method 2: Hard Rollback (Permanent)**

Use this to permanently go back to an old version and discard recent changes.

⚠️ **WARNING:** This will **DELETE** all changes after the rollback point!

```bash
# 1. Backup current state (just in case)
git branch backup-before-rollback

# 2. Hard reset to Version 2.22.0
git reset --hard 9208ec0

# 3. Force push to remote (if you want to update staging/production)
git push origin feat/ops-dashboard-exports --force

# 4. Rebuild everything
npm install
npm run build
```

**What Gets Deleted:**
- Version 2.22.1 (deployment flexibility)
- Any uncommitted changes
- Any commits after 9208ec0

**How to Recover:**
```bash
# If you change your mind, recover from backup
git checkout backup-before-rollback
```

---

### **Method 3: Soft Rollback (Create Revert Commit)**

Use this to undo changes but keep git history clean.

```bash
# 1. Create revert commit for Version 2.22.1
git revert 42610f0

# Git will create a NEW commit that undoes 2.22.1 changes
# This keeps history intact

# 2. Push to remote
git push origin feat/ops-dashboard-exports

# You're now on 2.22.0 functionality, but git history shows:
# - Version 2.22.1 (deployment flexibility)
# - Revert "Version 2.22.1" (undo)
```

---

## Rollback Decision Matrix

| Scenario | Recommended Method | Risk Level |
|----------|-------------------|------------|
| **Testing old version locally** | Method 1 (Temporary) | 🟢 Low - No changes lost |
| **Bug in production, need quick rollback** | Method 2 (Hard Reset) | 🔴 High - Changes deleted |
| **Want to undo but keep history** | Method 3 (Soft Revert) | 🟡 Medium - History preserved |
| **Need specific version for staging** | Method 1 + git checkout -b | 🟢 Low - Creates new branch |

---

## Version Reference Table

| Version | Git Commit | Date | What It Contains |
|---------|-----------|------|------------------|
| **2.22.1** | `42610f0` | Oct 5, 2025 | Deployment flexibility (current) |
| **2.22.0** | `9208ec0` | Oct 5, 2025 | Merchant V2 integration |
| **2.21.0** | `efbe72c` | Oct 1, 2025 | Ops Export APIs |
| **2.18.0** | `b43ea16` | Sep 30, 2025 | Settlement Pipeline |
| **2.17.0** | `b71c430` | Sep 29, 2025 | Connector Health |

---

## Step-by-Step: Rollback Ops and Merchant Separately

### **Rollback Only Ops Dashboard (Keep Merchant at Latest)**

This scenario: "Ops has a bug, rollback ops but keep merchant running"

**Problem:** You can't rollback individual dashboards in Version 2.22.0  
**Solution:** Use Version 2.22.1 with feature flags

```bash
# 1. Stay on Version 2.22.1
git checkout 42610f0

# 2. Build merchant-only version
npm run build:staging-merchant

# 3. Deploy to merchant server (unaffected by ops bug)

# 4. Fix ops dashboard bug in code

# 5. Build and deploy ops separately when fixed
npm run build:staging-ops
```

**Why this works:** Version 2.22.1 allows independent builds

---

### **Rollback Only Merchant Dashboard (Keep Ops at Latest)**

This scenario: "Merchant dashboard has issues, rollback merchant to mock data"

```bash
# Option A: Go back to Version 2.21.0 merchant code
git show efbe72c:ops-dashboard/src/pages/merchant/Settlements.tsx > \
  src/pages/merchant/Settlements.tsx.backup

# Copy old merchant files
git checkout efbe72c -- src/pages/merchant/Settlements.tsx
git checkout efbe72c -- services/merchant-api/db.js

# Rebuild
npm run build

# Option B: Use Version 2.22.1 and disable merchant
# Set VITE_ENABLE_MERCHANT_DASHBOARD=false
# Merchant routes return 404
```

---

## Verify Rollback Success

After rollback, verify the system works:

### **Check Version**
```bash
# Verify git commit
git log --oneline -1

# Should show:
# 9208ec0 Version 2.22.0: Merchant Dashboard V2 Database Integration
```

### **Check Frontend**
```bash
# Merchant dashboard should work
curl http://localhost:5174/merchant/settlements
# Should return HTML

# Ops dashboard should work
curl http://localhost:5174/ops/overview
# Should return HTML
```

### **Check APIs**
```bash
# Merchant API
curl http://localhost:8080/v1/merchant/dashboard/summary
# Should return JSON with real data

# Verify database connection
curl http://localhost:8080/v1/merchant/settlements?limit=1
# Should return settlements from database
```

### **Check Database**
```bash
# Connect to database
docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 -c "
  SELECT COUNT(*) FROM sp_v2_transactions WHERE merchant_id = 'MERCH001'
"

# Should show transaction count (e.g., 108)
```

---

## Rollback Troubleshooting

### **Issue: "npm run build" fails after rollback**

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### **Issue: Database connection fails**

```bash
# Check database is running
docker ps | grep settlepaisa_v2_db

# If not running, start it
docker start settlepaisa_v2_db

# Verify connection
docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 -c "SELECT 1"
```

### **Issue: Backend service won't start**

```bash
# Check if port is already in use
lsof -ti:8080

# Kill existing process
kill -9 $(lsof -ti:8080)

# Restart service
cd services/merchant-api
node index.js
```

### **Issue: Frontend shows old cached data**

```bash
# Clear browser cache
# Or hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)

# Or clear Vite cache
rm -rf node_modules/.vite
npm run build
```

---

## Emergency Rollback (Production)

If production is down and you need immediate rollback:

```bash
# 1. SSH to production server
ssh user@production-server

# 2. Go to deployment directory
cd /var/www/settlepaisa-dashboard

# 3. Pull last known good version
git fetch origin
git checkout 9208ec0

# 4. Rebuild FAST
npm install --production
npm run build

# 5. Restart services
pm2 restart all

# 6. Verify
curl http://localhost/merchant/settlements
curl http://localhost/ops/overview

# Done - Production restored in ~2 minutes
```

---

## Rollback Checklist

Before rollback:
- [ ] Identify the target version (commit hash)
- [ ] Backup current state (`git branch backup-current`)
- [ ] Notify team about rollback
- [ ] Check if database migration rollback needed

During rollback:
- [ ] Run `git checkout <commit>`
- [ ] Run `npm install`
- [ ] Run `npm run build`
- [ ] Restart backend services
- [ ] Restart frontend

After rollback:
- [ ] Verify merchant dashboard works
- [ ] Verify ops dashboard works
- [ ] Check all APIs respond correctly
- [ ] Monitor logs for errors
- [ ] Update team on rollback completion

---

## Important Notes

⚠️ **Database Rollback:**
- Code rollback is easy (git checkout)
- Database rollback is HARD (requires migrations)
- Version 2.22.0 doesn't change database schema
- Safe to rollback code without touching database

✅ **Safe Rollbacks:**
- 2.22.1 → 2.22.0 (No DB changes)
- 2.22.0 → 2.21.0 (No DB changes)
- Any version in 2.x series (Schema stable)

⚠️ **Environment Files:**
- `.env` files are NOT in git
- Manually backup `.env` before rollback
- Re-create `.env` after rollback if needed

---

## Get Help

If rollback fails:

1. **Check logs:**
```bash
# Frontend build errors
cat /tmp/vite.log

# Backend errors
cat /tmp/merchant-api.log
```

2. **Verify environment:**
```bash
# Check Node version
node --version  # Should be 20+

# Check npm version
npm --version

# Check database connection
psql postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2 -c "SELECT 1"
```

3. **Contact:**
- Check VERSION_2.22.0_CONTEXT.md for version details
- Check git commit messages: `git log --oneline -20`
- Review DEPLOYMENT_GUIDE.md

---

**Last Updated:** October 5, 2025  
**Maintained By:** Claude Code
