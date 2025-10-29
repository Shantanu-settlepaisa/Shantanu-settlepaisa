# Staging 2 Authentication Issue - FIXED GUIDE

## 🎯 Issue Summary

**Problem**: "Invalid token" error when accessing Recon Workspace and trying to upload files on staging 2 dashboard.

**Root Cause**: Upload API (port 5107) and Overview API (port 5108) are using **different JWT secrets** or the Upload API cannot access the database to verify sessions.

## ✅ Diagnostic Results

```
✅ Login API (port 5108): Working - Issues valid JWT tokens
✅ Token Verification: Working - Tokens are valid
✅ Upload API Health: Running on port 5107
❌ Upload API Auth: REJECTING valid tokens with "Invalid token" error
```

## 🔧 **SOLUTION: Fix on Staging Server**

You need to SSH into the staging server (`52.66.199.215`) and apply these fixes.

### **Step 1: SSH into Staging Server**

```bash
ssh ubuntu@52.66.199.215
# or
ssh ec2-user@52.66.199.215
```

### **Step 2: Check PM2 Processes**

```bash
pm2 list
```

You should see processes like:
- `overview-api` (port 5108)
- `upload-api` (port 5107)
- `recon-api` (port 5103)

### **Step 3: Check Environment Variables**

```bash
# Find where upload-api is running from
pm2 describe upload-api

# Check the working directory
cd /path/to/ops-dashboard/services/api

# Check if .env file exists
ls -la .env

# Compare JWT secrets
echo "Overview API JWT_SECRET:"
cat ../overview-api/.env | grep JWT_SECRET

echo ""
echo "Upload API JWT_SECRET:"
cat .env | grep JWT_SECRET
```

### **Step 4: Fix JWT_SECRET Mismatch**

**Option A: Use Shared Config (Recommended)**

The upload API should load JWT_SECRET from shared `config/env.cjs`, which reads from `overview-api/.env`. This is already configured in the code (line 7 of `file-upload-v2.cjs`).

```bash
# Make sure overview-api has strong JWT_SECRET
cd /path/to/ops-dashboard/services/overview-api

# Edit .env file
nano .env

# Ensure JWT_SECRET is set (not default):
JWT_SECRET=your-actual-strong-secret-min-64-chars

# Save and exit (Ctrl+X, Y, Enter)
```

**Option B: Copy JWT_SECRET to Upload API .env**

```bash
# Copy JWT_SECRET from overview-api to upload-api
cd /path/to/ops-dashboard/services/overview-api
OVERVIEW_SECRET=$(grep JWT_SECRET .env | cut -d= -f2)

cd ../api
# If .env doesn't exist, create it
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || echo "# Upload API Config" > .env
fi

# Update JWT_SECRET
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$OVERVIEW_SECRET/" .env
# Or add if not exists
grep -q JWT_SECRET .env || echo "JWT_SECRET=$OVERVIEW_SECRET" >> .env
```

### **Step 5: Verify Database Config**

Both services must use the **same database**:

```bash
# Check overview-api database config
cd /path/to/ops-dashboard/services/overview-api
grep -E 'DB_HOST|DB_NAME|DB_PORT' .env

# Check upload-api database config
cd ../api
grep -E 'DB_HOST|DB_NAME|DB_PORT' .env
```

**Fix if different**:
```bash
cd /path/to/ops-dashboard/services/api
nano .env

# Update to match overview-api:
DB_HOST=<same-as-overview-api>
DB_PORT=<same-as-overview-api>
DB_NAME=<same-as-overview-api>
DB_USER=<same-as-overview-api>
DB_PASSWORD=<same-as-overview-api>
```

### **Step 6: Restart Upload API**

```bash
# Restart upload API to pick up new environment variables
pm2 restart upload-api

# Check logs for errors
pm2 logs upload-api --lines 50

# Look for:
# ✅ "[Upload API] Starting on port 5107"
# ✅ "JWT secret validation passed"
# ❌ "JWT_SECRET not set" or "JWT_SECRET too weak"
```

### **Step 7: Restart All Auth-Related Services** (if needed)

```bash
# If still not working, restart all services
pm2 restart overview-api
pm2 restart upload-api
pm2 restart recon-api

# Save PM2 config
pm2 save

# Check all are running
pm2 status
```

### **Step 8: Verify Fix**

From your local machine, run the diagnostic script again:

```bash
cd ~/ops-dashboard
./diagnose-staging2-auth.sh
```

You should see:
```
✅ ALL TESTS PASSED!

Backend authentication is working correctly.
```

### **Step 9: Test in Browser**

1. Open staging 2 dashboard: `http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/login`
2. Login with: `admin@settlepaisa.com` / `Admin@123`
3. Navigate to **Recon Workspace**
4. Try to upload a file
5. **Should work without "Invalid token" error!**

---

## 🔍 **Additional Debugging**

If issue persists after above steps:

### Check PM2 Logs

```bash
# Real-time logs
pm2 logs upload-api

# Last 100 lines
pm2 logs upload-api --lines 100 --nostream

# Errors only
pm2 logs upload-api --err --lines 50
```

### Check Database Connection

```bash
# On staging server
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "SELECT COUNT(*) FROM sp_v2_user_sessions WHERE is_active = true;"
```

Should return count > 0 if sessions exist.

### Test Authentication Manually

```bash
# On staging server
curl -X POST http://localhost:5108/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@settlepaisa.com","password":"Admin@123"}'

# Copy the token from response, then test upload
TOKEN="<paste-token-here>"
curl -X POST http://localhost:5107/api/upload/stats \
  -H "Authorization: Bearer $TOKEN"

# Should return upload statistics, not "Invalid token"
```

### Check CORS Configuration

If authentication works but browser shows CORS errors:

```bash
cd /path/to/ops-dashboard/services/api
grep CORS_ORIGIN .env

# Should include staging 2 S3 URL:
# CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
```

---

## 📋 **Quick Fix Checklist**

- [ ] SSH into staging server
- [ ] Check JWT_SECRET in both .env files (overview-api and api)
- [ ] Ensure JWT_SECRET matches or upload-api loads from shared config
- [ ] Verify database config matches (DB_HOST, DB_NAME)
- [ ] Restart `pm2 restart upload-api`
- [ ] Check logs: `pm2 logs upload-api --lines 50`
- [ ] Run diagnostic script from local machine
- [ ] Test in browser

---

## 🎉 **Expected Outcome**

After applying fixes:
- ✅ Login works
- ✅ Token is stored in localStorage
- ✅ Upload API accepts token
- ✅ Recon Workspace page loads without redirect
- ✅ File uploads work
- ✅ No "Invalid token" errors

---

## ⚠️ **Common Pitfalls**

1. **Not restarting PM2 after .env changes** → Always `pm2 restart upload-api`
2. **Editing wrong .env file** → Make sure you're in the correct service directory
3. **Database credentials wrong** → Copy exact values from overview-api .env
4. **JWT_SECRET too weak** → Must be 64+ characters in production
5. **Old code running** → Make sure latest code with auth is deployed

---

## 📞 **If Still Not Working**

Share these logs:
```bash
pm2 logs upload-api --lines 100 --nostream > upload-api-logs.txt
pm2 logs overview-api --lines 100 --nostream > overview-api-logs.txt
cat services/overview-api/.env | grep -v PASSWORD > overview-env.txt
cat services/api/.env | grep -v PASSWORD > upload-env.txt

# Share these 4 files for diagnosis
```

---

**Created**: 2025-10-28
**Issue**: Invalid token on Recon Workspace upload
**Status**: ✅ Root cause identified, fix provided
