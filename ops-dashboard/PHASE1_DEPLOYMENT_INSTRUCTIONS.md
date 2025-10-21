# Phase 1 Authentication - Staging Deployment Instructions

**Created:** 2025-10-21
**Status:** Ready for Deployment
**Commit:** 9e265e7
**Branch:** feat/ops-dashboard-exports

---

## ✅ Pre-Deployment Checklist

- [x] Code committed to git
- [x] Code pushed to remote repository
- [x] Deployment script created (`deploy-phase1-staging.sh`)
- [x] All Phase 1 files verified locally

---

## 📋 Deployment Steps

### Option 1: Automated Deployment (Recommended)

**1. Copy deployment script to EC2:**
```bash
scp -i /path/to/settlepaisa-backend-key.pem \
    deploy-phase1-staging.sh \
    ec2-user@13.201.179.44:~/
```

**2. SSH to EC2:**
```bash
ssh -i /path/to/settlepaisa-backend-key.pem ec2-user@13.201.179.44
```

**3. Run deployment script:**
```bash
chmod +x deploy-phase1-staging.sh
./deploy-phase1-staging.sh
```

**4. Monitor output:**
- The script will show progress for each step
- All tests will run automatically
- Final status will be displayed

**Expected Duration:** 5-10 minutes

---

### Option 2: Manual Deployment

If you prefer manual control, follow these steps on EC2:

```bash
# 1. Navigate to project
cd ~/ops-dashboard

# 2. Pull latest code
git fetch origin feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

# 3. Run migrations
export PGPASSWORD='SettlePaisa2024!'
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -f db/migrations/025_add_settlement_type.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -f db/migrations/026_user_management.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -f db/migrations/027_audit_log.sql

psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -f db/migrations/028_production_indexes_fixed.sql
unset PGPASSWORD

# 4. Install dependencies
cd ~/ops-dashboard/services/overview-api
npm install

# 5. Update .env (generate JWT secret)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
cat >> .env << EOF

# Phase 1 Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d
LOG_LEVEL=info
SERVICE_NAME=overview-api
CORS_ORIGIN=http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com
EOF

# 6. Update admin password
export PGPASSWORD='SettlePaisa2024!'
ADMIN_HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('StagingAdmin2025!', 10));")
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -c "UPDATE sp_v2_ops_users SET password_hash = '${ADMIN_HASH}' WHERE email = 'admin@settlepaisa.com';"
unset PGPASSWORD

# 7. Restart service
pm2 restart overview-api
sleep 3
pm2 logs overview-api --lines 20

# 8. Test login
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}' | jq .
```

---

## 🧪 Testing After Deployment

### Test 1: Health Check (Public)
```bash
curl http://13.201.179.44:5108/health
```

**Expected:**
```json
{
  "status": "healthy",
  "service": "overview-api",
  "port": 5108
}
```

---

### Test 2: Login (Public)
```bash
curl -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "...",
    "expiresAt": "...",
    "user": {
      "id": "...",
      "email": "admin@settlepaisa.com",
      "full_name": "System Administrator",
      "role": "ADMIN"
    }
  }
}
```

---

### Test 3: Protected Route with Token
```bash
# First get token
TOKEN=$(curl -s -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}' | jq -r '.data.token')

# Then access protected route
curl -X GET "http://13.201.179.44:5108/api/audit/summary" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Audit summary data returned

---

### Test 4: Unauthorized Access
```bash
curl http://13.201.179.44:5108/api/audit/summary
```

**Expected:**
```json
{
  "success": false,
  "error": "No authentication token provided"
}
```

---

## 📊 What Was Deployed

### Database Changes (4 Migrations)

1. **025_add_settlement_type.sql**
   - Added `settlement_type` enum
   - Added `priority` field to settlement batches

2. **026_user_management.sql**
   - Created `sp_v2_ops_users` table
   - Created `sp_v2_user_sessions` table
   - Created `sp_v2_user_permissions` table
   - Created `sp_v2_login_attempts` table
   - Inserted default admin user

3. **027_audit_log.sql**
   - Created `sp_v2_ops_audit_log` table
   - Created 4 monitoring views

4. **028_production_indexes_fixed.sql**
   - Created 17 performance indexes

---

### Backend Code Changes

**New Files:**
- `services/overview-api/auth.cjs` - Authentication API
- `services/overview-api/audit.cjs` - Audit log API
- `services/overview-api/lib/logger.cjs` - Winston logger
- `services/overview-api/lib/passwordUtils.cjs` - Password utilities
- `services/overview-api/middleware/authMiddleware.cjs` - JWT middleware

**Modified Files:**
- `services/overview-api/index.js` - Added auth routes
- `services/overview-api/real-db-adapter.cjs` - Added getDbPool export
- `services/overview-api/package.json` - Added dependencies

**New Dependencies:**
- bcryptjs@2.4.3
- jsonwebtoken@9.0.2
- winston@3.11.0

---

### Environment Variables Added

```bash
JWT_SECRET=<64-byte random hex>
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d
LOG_LEVEL=info
SERVICE_NAME=overview-api
CORS_ORIGIN=http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🔐 Credentials

### Admin Account
- **Email:** admin@settlepaisa.com
- **Password:** StagingAdmin2025!
- **Role:** ADMIN

### Database (RDS)
- **Host:** settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
- **Port:** 5432
- **Database:** settlepaisa_v2
- **User:** postgres
- **Password:** SettlePaisa2024!

---

## 🌐 API Endpoints

### Public Endpoints (No Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/auth/login` | Login and get JWT token |
| POST | `/api/auth/verify-token` | Verify token validity |

### Protected Endpoints (Require Authentication)

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| GET | `/api/auth/me` | Get current user info | Any authenticated |
| POST | `/api/auth/logout` | Logout and revoke session | Any authenticated |
| POST | `/api/auth/change-password` | Change password | Any authenticated |
| POST | `/api/auth/register` | Register new user | ADMIN only |
| GET | `/api/audit/*` | Audit log queries | Ops staff only |

---

## ✅ Success Criteria

The deployment is successful if all of the following pass:

- [ ] All 4 migrations applied without errors
- [ ] Dependencies installed (bcryptjs, jsonwebtoken, winston)
- [ ] overview-api service running (green in `pm2 list`)
- [ ] Health check returns `{"status":"healthy"}`
- [ ] Login returns JWT token
- [ ] Protected routes reject requests without token
- [ ] Protected routes accept requests with valid token
- [ ] Audit logs created in `sp_v2_ops_audit_log` table
- [ ] Sessions created in `sp_v2_user_sessions` table
- [ ] No errors in PM2 logs (`pm2 logs overview-api`)

---

## 🚨 Troubleshooting

### Issue: Migrations Fail

**Check if tables already exist:**
```bash
export PGPASSWORD='SettlePaisa2024!'
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -c "\dt sp_v2_ops_*"
```

**If tables exist, migrations already ran (safe to continue)**

---

### Issue: Login Returns "Invalid email or password"

**Check admin user exists:**
```bash
export PGPASSWORD='SettlePaisa2024!'
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 \
     -c "SELECT email, role FROM sp_v2_ops_users WHERE email = 'admin@settlepaisa.com';"
```

**Re-run password update command (see manual deployment Step 6)**

---

### Issue: Service Won't Start

**Check PM2 logs:**
```bash
pm2 logs overview-api --lines 100
```

**Common issues:**
- Missing dependencies: Run `npm install` in services/overview-api
- Missing .env variables: Check .env file exists and has JWT_SECRET
- Database connection: Verify DB_HOST in .env points to RDS

---

### Issue: Protected Routes Return 500 Error

**Check if getDbPool is exported:**
```bash
cd ~/ops-dashboard/services/overview-api
grep "getDbPool" real-db-adapter.cjs
```

**Should see:** `getDbPool` in module.exports

---

## 🔄 Rollback Procedure

If deployment fails and you need to rollback:

```bash
# 1. Stop service
pm2 stop overview-api

# 2. Rollback code
cd ~/ops-dashboard
git reset --hard aed5d91  # Previous working commit

# 3. Rollback database (CAREFUL!)
export PGPASSWORD='SettlePaisa2024!'
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
     -U postgres -d settlepaisa_v2 << 'EOF'
DROP TABLE IF EXISTS sp_v2_ops_audit_log CASCADE;
DROP TABLE IF EXISTS sp_v2_login_attempts CASCADE;
DROP TABLE IF EXISTS sp_v2_user_permissions CASCADE;
DROP TABLE IF EXISTS sp_v2_user_sessions CASCADE;
DROP TABLE IF EXISTS sp_v2_ops_users CASCADE;
-- Note: Indexes will remain but are harmless
EOF
unset PGPASSWORD

# 4. Restart service
pm2 restart overview-api
```

---

## 📝 Post-Deployment Tasks

1. **Monitor Logs (24 hours)**
   ```bash
   pm2 logs overview-api
   ```

2. **Test All Endpoints**
   - Use PHASE1_TESTING_GUIDE.md for comprehensive testing

3. **Update Team**
   - Share admin credentials securely
   - Document authentication requirements for frontend

4. **Plan Phase 2**
   - Settlement Approval UI
   - Frontend authentication integration

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs overview-api`
2. Check database tables exist: See troubleshooting section
3. Verify .env file has all required variables
4. Re-run deployment script

---

## 📚 Documentation

**Reference Documents:**
- `PHASE1_README.md` - Complete Phase 1 overview
- `PHASE1_TESTING_GUIDE.md` - 21 test scenarios
- `PHASE1_TEST_RESULTS.md` - Local test results
- `PHASE1_IMPLEMENTATION_COMPLETE.md` - Implementation summary

---

**Deployment script:** `deploy-phase1-staging.sh`
**Prepared by:** Claude Code
**Date:** 2025-10-21
