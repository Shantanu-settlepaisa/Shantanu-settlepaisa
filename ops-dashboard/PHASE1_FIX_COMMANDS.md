# Phase 1 Staging Fix - Quick Reference

**Issue:** Auth routes returning 404 on staging
**Root Cause:** PM2 may have cached old code or modules didn't load properly
**Solution:** Hard restart with fresh git pull

---

## 🚀 Quick Fix (Copy-Paste)

### Option 1: Automated Script (Recommended)

```bash
# 1. SSH to staging
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44

# 2. Upload and run fix script
cd ~/ops-dashboard
wget https://raw.githubusercontent.com/your-repo/ops-dashboard/feat/ops-dashboard-exports/fix-phase1-staging.sh
chmod +x fix-phase1-staging.sh
./fix-phase1-staging.sh
```

**OR upload the script manually:**

```bash
# From local machine
scp -i ~/.ssh/settlepaisa-backend-key \
  /Users/shantanusingh/ops-dashboard/fix-phase1-staging.sh \
  ec2-user@13.201.179.44:~/ops-dashboard/

# Then SSH and run
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44
cd ~/ops-dashboard
chmod +x fix-phase1-staging.sh
./fix-phase1-staging.sh
```

---

### Option 2: Manual Commands (Step-by-Step)

```bash
# 1. SSH to staging
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44

# 2. Navigate to project
cd ~/ops-dashboard

# 3. Force clean pull
git fetch origin feat/ops-dashboard-exports
git reset --hard origin/feat/ops-dashboard-exports
git log -1 --oneline  # Should show: 9e265e7

# 4. Verify files exist
ls -la services/overview-api/auth.cjs
ls -la services/overview-api/lib/logger.cjs
grep -n "app.use('/api/auth" services/overview-api/index.js

# 5. Test module loading
cd ~/services/overview-api
node -e "const auth = require('./auth.cjs'); console.log('Routes:', auth.stack.length);"
# Should output: Routes: 6

# 6. Hard restart PM2
pm2 delete overview-api
pm2 start index.js --name overview-api --cwd ~/services/overview-api
pm2 list
pm2 logs overview-api --lines 30

# 7. Test auth endpoint
curl -X POST http://localhost:5108/api/auth/login
# Should return 400 (not 404)

# 8. Test with credentials
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'
# Should return JWT token

# 9. Test external access
curl -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'
```

---

## 🔍 Troubleshooting

### If auth endpoint still returns 404:

```bash
# Check PM2 logs for errors
pm2 logs overview-api --lines 100 | grep -i error

# Check if modules load
cd ~/services/overview-api
node -e "try { require('./auth.cjs'); console.log('✅ OK'); } catch(e) { console.log('❌', e.message); }"

# Check dependencies
npm list bcryptjs jsonwebtoken winston --depth=0

# Reinstall dependencies if needed
npm install --production

# Check index.js
grep -A 2 -B 2 "app.use('/api/auth" index.js
```

### If module loading fails:

```bash
# Check for missing dependencies
cd ~/services/overview-api
npm install bcryptjs jsonwebtoken winston --save

# Verify file permissions
ls -la auth.cjs lib/ middleware/

# Check Node.js version
node --version  # Should be 14+ or 16+
```

### If PM2 won't restart:

```bash
# Kill all PM2 processes
pm2 kill

# Start from scratch
cd ~/services/overview-api
pm2 start index.js --name overview-api

# Save PM2 config
pm2 save
```

---

## ✅ Success Verification

After running the fix, verify:

1. **Auth endpoint accessible:**
   ```bash
   curl -X POST http://localhost:5108/api/auth/login
   # Returns: 400 (missing credentials) - NOT 404
   ```

2. **Login works:**
   ```bash
   curl -X POST http://localhost:5108/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'
   # Returns: JWT token
   ```

3. **Protected routes work:**
   ```bash
   TOKEN="your-jwt-token-here"
   curl -X GET "http://localhost:5108/api/audit/summary" \
     -H "Authorization: Bearer $TOKEN"
   # Returns: Audit summary
   ```

4. **External access works:**
   ```bash
   curl -X POST http://13.201.179.44:5108/api/auth/login
   # Returns: 400 (accessible from outside)
   ```

---

## 📝 What the Fix Does

1. ✅ **Force clean git pull** - Ensures we have commit 9e265e7 with all Phase 1 code
2. ✅ **Verify all files exist** - Checks auth.cjs, lib/, middleware/ are present
3. ✅ **Test module loading** - Verifies modules load without errors
4. ✅ **Hard PM2 restart** - Deletes old process and creates fresh one (clears cache)
5. ✅ **Verify dependencies** - Ensures bcryptjs, jsonwebtoken, winston are installed
6. ✅ **Test endpoints** - Confirms auth routes are accessible

---

## 🔐 Credentials

**Staging Admin:**
- Email: `admin@settlepaisa.com`
- Password: `StagingAdmin2025!`

**Database (RDS):**
- Host: `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com`
- Port: `5432`
- Database: `settlepaisa_v2`
- User: `postgres`
- Password: `SettlePaisa2024`

---

## 📞 Support

**If fix fails:**
1. Check PM2 logs: `pm2 logs overview-api --lines 100`
2. Check module loading: `node -e "require('./auth.cjs')"`
3. Verify git commit: `git log -1 --oneline` (should be 9e265e7)
4. Check file existence: `ls -la services/overview-api/auth.cjs`

**Emergency rollback:**
```bash
pm2 restart overview-api
# Existing APIs will continue to work, auth just won't be available
```

---

**Last Updated:** October 21, 2025
**Issue:** Phase 1 auth routes 404
**Status:** Fix ready to deploy
