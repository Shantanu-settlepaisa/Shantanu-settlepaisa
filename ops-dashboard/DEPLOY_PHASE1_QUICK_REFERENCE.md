# Phase 1 Deployment - Quick Reference Card

**Date:** 2025-10-21
**Commit:** 9e265e7 ✅ Pushed to remote
**Status:** 🟢 Ready for Deployment

---

## ⚡ Quick Deploy (Copy-Paste)

### Step 1: Copy script to EC2
```bash
scp -i /path/to/settlepaisa-backend-key.pem \
    ops-dashboard/deploy-phase1-staging.sh \
    ec2-user@13.201.179.44:~/
```

### Step 2: SSH and run
```bash
ssh -i /path/to/settlepaisa-backend-key.pem ec2-user@13.201.179.44
chmod +x deploy-phase1-staging.sh
./deploy-phase1-staging.sh
```

**Duration:** 5-10 minutes
**Output:** Automated testing + final status

---

## 🔑 Credentials (After Deployment)

**Admin Login:**
- Email: `admin@settlepaisa.com`
- Password: `StagingAdmin2025!`

**API:** `http://13.201.179.44:5108`

---

## 🧪 Quick Test (From Your Machine)

```bash
# Test login
curl -X POST http://13.201.179.44:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'

# Should return JWT token
```

---

## ✅ Success Checklist

After deployment, verify:
- [ ] Health check: `http://13.201.179.44:5108/health` returns "healthy"
- [ ] Login returns JWT token
- [ ] PM2 shows overview-api running (green)
- [ ] No errors in deployment script output

---

## 📋 What's Deployed

- ✅ 4 database migrations (user tables, audit log, indexes)
- ✅ 5 backend files (auth API, audit API, middleware, utils)
- ✅ 3 npm packages (bcryptjs, jsonwebtoken, winston)
- ✅ JWT authentication with 8-hour expiry
- ✅ Audit logging for all user actions
- ✅ Role-based access control (ADMIN, OPS_MANAGER, OPS_VIEWER, FINANCE)

---

## 📖 Documentation

**Quick Start:** `PHASE1_DEPLOYMENT_INSTRUCTIONS.md`
**Full Details:** `PHASE1_DEPLOYMENT_STATUS.md`
**Testing:** `PHASE1_TESTING_GUIDE.md`
**API Docs:** `PHASE1_README.md`

---

## 🚨 If Something Goes Wrong

**Check logs:**
```bash
pm2 logs overview-api --lines 50
```

**Rollback:**
```bash
cd ~/ops-dashboard
git reset --hard aed5d91
pm2 restart overview-api
```

**Get help:** See troubleshooting section in `PHASE1_DEPLOYMENT_INSTRUCTIONS.md`

---

**That's it! 🎉**
