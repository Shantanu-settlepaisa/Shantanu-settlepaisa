# Connector Health Endpoint - Deployment Ready

**Date:** 2025-10-21
**Status:** ✅ Code Ready | ⚠️ Awaiting EC2 Deployment
**Commit:** 8e2b1dc (already pushed to GitHub)

---

## Summary

The `/api/connectors/health` endpoint has been implemented and is ready for deployment to staging. This endpoint fixes the 404 error reported in the staging dashboard console.

### What Was Fixed

1. **Frontend Environment Variable**: Added `VITE_INGEST_API_URL=http://13.201.179.44:5108` to `.env.staging-ops`
2. **Frontend Rebuild & Deploy**: Rebuilt with correct environment and deployed to S3 ✅ **COMPLETE**
3. **Backend Endpoint**: Added `/api/connectors/health` endpoint to `services/overview-api/index.js` (commit 8e2b1dc)
4. **Backend Deployment**: ⚠️ **PENDING** - Needs deployment to EC2

---

## Current Status

### ✅ Completed

- [x] Backend code committed (8e2b1dc)
- [x] Code pushed to GitHub (feat/ops-dashboard-exports branch)
- [x] Frontend environment variable fixed
- [x] Frontend rebuilt with correct staging config
- [x] Frontend deployed to S3 (ops-dashboard-staging bucket)
- [x] Deployment script created (`deploy-connector-health-fix.sh`)

### ⚠️ Pending

- [ ] Deploy backend update to EC2 (13.201.179.44)
- [ ] Test staging dashboard after deployment

---

## Deployment Instructions

### Option 1: Automated Script (Recommended)

```bash
# 1. Copy deployment script to EC2
scp -i <your-key.pem> deploy-connector-health-fix.sh ec2-user@13.201.179.44:~/

# 2. SSH to EC2
ssh -i <your-key.pem> ec2-user@13.201.179.44

# 3. Run deployment script
chmod +x deploy-connector-health-fix.sh
./deploy-connector-health-fix.sh
```

### Option 2: Manual Deployment

```bash
# 1. SSH to EC2
ssh -i <your-key.pem> ec2-user@13.201.179.44

# 2. Navigate to project
cd ~/ops-dashboard

# 3. Pull latest code
git fetch origin feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

# 4. Verify endpoint exists
grep -A5 "/api/connectors/health" services/overview-api/index.js

# 5. Restart service
pm2 restart overview-api

# 6. Test endpoint
curl http://localhost:5108/api/connectors/health | jq .

# 7. Test public access
curl http://13.201.179.44:5108/api/connectors/health | jq .
```

---

## Endpoint Details

### URL
```
http://13.201.179.44:5108/api/connectors/health
```

### Response Format
```json
{
  "success": true,
  "connectors": [
    {
      "name": "HDFC SFTP",
      "status": "OK",
      "lastSync": "2025-10-21T10:35:00.000Z",
      "queuedFiles": 0,
      "failures": 0
    },
    {
      "name": "ICICI API",
      "status": "OK",
      "lastSync": "2025-10-21T10:30:00.000Z",
      "queuedFiles": 0,
      "failures": 0
    },
    // ... more connectors
  ],
  "timestamp": "2025-10-21T10:40:00.000Z"
}
```

### Code Location
**File:** `/Users/shantanusingh/ops-dashboard/services/overview-api/index.js`
**Lines:** 337-389

---

## Testing After Deployment

### 1. Test Endpoint Directly
```bash
curl http://13.201.179.44:5108/api/connectors/health
```

**Expected:** JSON response with `success: true` and list of connectors

### 2. Test Staging Dashboard
1. Open: http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com
2. Open browser console (F12)
3. Navigate to Overview page
4. Verify NO 404 errors on `/api/connectors/health`

### 3. Verify All Backend Services
```bash
# From EC2
pm2 status

# Expected:
overview-api     │ 5108   │ online
recon-api        │ 5103   │ online
# ... other services
```

---

## Error Resolution

### Before Deployment

**Errors in Console:**
```
❌ http://13.201.179.44:5108/api/connectors/health
   Failed to load resource: 404 (Not Found)

❌ localhost:5106/api/ingest/health
   Failed to load resource: ERR_CONNECTION_REFUSED
```

### After Frontend Fix (Already Done)

**Errors in Console:**
```
✅ No more localhost:5106 errors

❌ http://13.201.179.44:5108/api/connectors/health
   Failed to load resource: 404 (Not Found)
```

### After Backend Deployment (Next Step)

**Expected Console:**
```
✅ No localhost:5106 errors
✅ No 404 errors on /api/connectors/health
✅ All API calls successful
```

---

## Files Modified in This Session

### Local Changes
1. `.env.staging-ops` - Added `VITE_INGEST_API_URL`
2. `dist-ops/*` - Complete rebuild with new environment
3. `deploy-connector-health-fix.sh` - **NEW** deployment script

### Already Committed (from previous session)
1. `services/overview-api/index.js` - Added `/api/connectors/health` endpoint (commit 8e2b1dc)

---

## SSH Key Location

**Required:** You need the EC2 SSH key to deploy. Common locations:
- `/tmp/settlepaisa-backend-key.pem`
- `~/.ssh/settlepaisa-backend-key.pem`
- `~/Downloads/settlepaisa-backend-key.pem`

**If key is missing:**
1. Download from AWS Console (EC2 → Key Pairs)
2. Or ask team member who has access
3. Set permissions: `chmod 400 <key-file>.pem`

---

## Rollback Plan

If deployment causes issues:

```bash
# SSH to EC2
ssh -i <key> ec2-user@13.201.179.44

# Rollback to previous commit
cd ~/ops-dashboard
git checkout <previous-commit>

# Restart service
pm2 restart overview-api

# Verify service is running
pm2 logs overview-api --lines 50
```

---

## Next Steps

1. **Locate SSH key** for EC2 instance (13.201.179.44)
2. **Run deployment** using either automated script or manual steps above
3. **Test staging dashboard** to confirm all errors resolved
4. **Monitor logs** for 10-15 minutes to ensure stability

---

## Support

**EC2 Instance:** i-08ac67ac776d4ab23 (13.201.179.44)
**Region:** ap-south-1 (Mumbai)
**Project Directory:** ~/ops-dashboard
**Service Name:** overview-api
**Port:** 5108

**PM2 Logs:**
```bash
pm2 logs overview-api --lines 100
```

**Service Status:**
```bash
pm2 list
```

---

**Prepared by:** Claude Code
**Date:** 2025-10-21 22:45 IST
