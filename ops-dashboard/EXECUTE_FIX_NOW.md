# Execute Phase 1 Fix - Manual Instructions

**Date:** October 21, 2025
**Status:** SSH key permission issue - manual execution required
**Action:** You need to SSH to staging and run these commands

---

## 🔐 SSH Access Issue

The automated SSH failed with permission error. This could be because:
1. The SSH key isn't authorized on the EC2 instance
2. The key was rotated
3. Need to use EC2 Instance Connect instead

---

## 🚀 How to Access Staging

### Option 1: AWS Console - EC2 Instance Connect (Recommended)

1. Go to AWS Console → EC2
2. Find instance `13.201.179.44`
3. Click "Connect" → "EC2 Instance Connect"
4. Opens browser-based terminal
5. Run the commands below

### Option 2: SSH with Correct Key

```bash
# Try the key
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44

# If that doesn't work, try other keys:
ssh -i ~/.ssh/temp_ec2_key ec2-user@13.201.179.44
ssh -i ~/.ssh/temp_ec2_key2 ec2-user@13.201.179.44
ssh -i ~/.ssh/temp_ec2_key3 ec2-user@13.201.179.44
```

### Option 3: AWS Systems Manager Session Manager

```bash
aws ssm start-session --target i-INSTANCE-ID
```

---

## 📋 Commands to Execute (Copy-Paste)

Once you're connected to the staging server, run these commands:

### Step 1: Verify Current State

```bash
cd ~/ops-dashboard
pwd
git log -1 --oneline
git status --short
```

**Expected:** Should show some commit, possibly not 9e265e7

---

### Step 2: Force Clean Git Pull

```bash
cd ~/ops-dashboard
git fetch origin feat/ops-dashboard-exports
git reset --hard origin/feat/ops-dashboard-exports
git log -1 --oneline
```

**Expected:** Should show `9e265e7 feat: Add JWT authentication and comprehensive audit system (Phase 1)`

---

### Step 3: Verify Files Exist

```bash
cd ~/ops-dashboard

# Check auth.cjs
ls -lh services/overview-api/auth.cjs

# Check lib directory
ls -la services/overview-api/lib/

# Check middleware
ls -la services/overview-api/middleware/

# Verify index.js has auth route mounting
grep -n "app.use('/api/auth" services/overview-api/index.js
```

**Expected:** All files should exist, grep should show line 47

---

### Step 4: Test Module Loading

```bash
cd ~/services/overview-api

# Test if auth module loads
node -e "try { const auth = require('./auth.cjs'); console.log('✅ Auth loaded with', auth.stack.length, 'routes'); } catch(e) { console.log('❌ Error:', e.message); }"
```

**Expected:** `✅ Auth loaded with 6 routes`

---

### Step 5: Hard Restart PM2

```bash
cd ~/services/overview-api

# Check current PM2 status
pm2 list

# Delete the old process (clears cache)
pm2 delete overview-api

# Start fresh with correct working directory
pm2 start index.js --name overview-api --cwd ~/services/overview-api

# Verify it's running
pm2 list

# Check logs
pm2 logs overview-api --lines 30 --nostream
```

**Expected:** PM2 should show overview-api running, logs should show no errors

---

### Step 6: Test Auth Endpoints

```bash
# Test 1: Auth endpoint should return 400 (NOT 404)
curl -X POST http://localhost:5108/api/auth/login

# Expected output:
# {"success":false,"error":"Missing required fields: email, password"}
```

**If you see 404 here, the fix didn't work - STOP and report back.**

**If you see 400, continue:**

```bash
# Test 2: Login with admin credentials
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'

# Expected output:
# {"success":true,"data":{"token":"eyJhbG...","user":{...}}}
```

---

### Step 7: Test External Access

```bash
# From staging server, test public IP
curl -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'

# Should return same JWT token response
```

---

### Step 8: Test Protected Routes

```bash
# Extract token from login response (or copy it manually)
TOKEN="paste-your-jwt-token-here"

# Test protected route
curl -X GET "http://localhost:5108/api/audit/summary" \
  -H "Authorization: Bearer $TOKEN"

# Expected: Should return audit summary data
```

---

## ✅ Success Criteria

If all tests pass, you should see:

- ✅ Git on commit 9e265e7
- ✅ All Phase 1 files exist
- ✅ Auth module loads with 6 routes
- ✅ PM2 running without errors
- ✅ `/api/auth/login` returns 400 (not 404)
- ✅ Admin login returns JWT token
- ✅ External access works
- ✅ Protected routes require authentication

---

## ❌ If Something Fails

### If auth still returns 404:

```bash
# Check PM2 logs for errors
pm2 logs overview-api --lines 100 | grep -i error

# Check if files are actually there
ls -la ~/services/overview-api/auth.cjs
ls -la ~/services/overview-api/lib/
ls -la ~/services/overview-api/middleware/

# Test module loading again
cd ~/services/overview-api
node -e "const auth = require('./auth.cjs'); console.log('Routes:', auth.stack.length);"

# Check dependencies
npm list bcryptjs jsonwebtoken winston --depth=0

# If dependencies missing, reinstall
npm install --production

# Try PM2 restart again
pm2 delete overview-api
pm2 start index.js --name overview-api --cwd ~/services/overview-api
```

### If module loading fails:

```bash
cd ~/services/overview-api

# Reinstall dependencies
npm install bcryptjs jsonwebtoken winston --save
npm install --production

# Test again
node -e "const auth = require('./auth.cjs'); console.log('OK');"

# Restart PM2
pm2 restart overview-api
```

---

## 🎯 Alternative: Run Automated Script

Instead of manual commands, you can run the automated script:

```bash
# After SSHing to staging
cd ~/ops-dashboard
chmod +x fix-phase1-staging.sh
./fix-phase1-staging.sh
```

This script does all the steps above automatically with detailed output.

---

## 📊 Report Back

After running the commands, please report:

1. **Git commit:** What does `git log -1 --oneline` show?
2. **Module loading:** Did auth.cjs load with 6 routes?
3. **Auth endpoint:** Does it return 400 or 404?
4. **Login test:** Did admin login return a JWT token?
5. **Any errors:** Copy any error messages from PM2 logs

---

## 🔑 Quick Reference

**Staging Server:**
- IP: `13.201.179.44`
- User: `ec2-user`
- Project dir: `~/ops-dashboard`
- Service dir: `~/services/overview-api`

**Admin Credentials:**
- Email: `admin@settlepaisa.com`
- Password: `StagingAdmin2025!`

**Expected Commit:**
- `9e265e7 feat: Add JWT authentication and comprehensive audit system (Phase 1)`

---

## ⏱️ Time Estimate

- SSH access: 1-2 min
- Git pull: 30 sec
- PM2 restart: 1 min
- Testing: 2 min
- **Total: 5 minutes**

---

## 🚨 Rollback (if needed)

If something breaks:

```bash
pm2 restart overview-api
```

Existing APIs will continue to work, auth just won't be available.

---

**Ready to execute?** SSH to staging and run the commands above! 🚀

Report back with results and I'll help if anything fails.
