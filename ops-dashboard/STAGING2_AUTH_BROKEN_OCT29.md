# 🚨 Staging 2 Authentication Broken - Oct 29, 2025

## Current Status
❌ **Upload failing with 401 Unauthorized**
- Frontend URLs are correct (52.66.199.215:5107) ✅
- Backend services partially running ❌
- Users cannot login to get fresh tokens ❌

## Root Cause Analysis

### Service Status on EC2
```
Port 5103 (Recon API):    ✅ Running
Port 5106 (Auth API):     ❌ NOT RUNNING
Port 5107 (Upload API):   ✅ Running
Port 5108 (Overview API): ✅ Running

Other services (5101, 5102, 5104, 5105): ❌ NOT RUNNING
```

### The Problem
1. **Auth API (port 5106) is down** → Users cannot login → No way to get valid tokens
2. **JWT_SECRET mismatch** → Old tokens in browser don't match server's JWT_SECRET
3. **Recent deployment** likely restarted services with different .env configuration

## Why This Happened

### Most Likely Scenario
Someone ran `pm2 restart all` on EC2 with incorrect .env files:
```bash
# What probably happened:
ssh ec2-user@52.66.199.215
cd /home/ec2-user/ops-dashboard
git pull  # This pulled LOCAL .env files with localhost config
pm2 restart all  # Services restarted with wrong JWT_SECRET
```

### Evidence
- Local `.env` files have: `JWT_SECRET=local-testing-secret`
- Staging needs a different JWT_SECRET that matches across all services
- Auth API (port 5106) is not running at all

## Immediate Fix Required

### Step 1: SSH to EC2 and Check Services
```bash
ssh ec2-user@52.66.199.215
pm2 status
```

**Look for:**
- Which services are running?
- Which are crashed?
- What are the error logs?

### Step 2: Check .env Configuration
```bash
cd /home/ec2-user/ops-dashboard/services

# Check overview-api JWT_SECRET
cat overview-api/.env | grep JWT_SECRET

# Check upload-api JWT_SECRET
cat api/.env | grep JWT_SECRET
```

**Both should have the SAME JWT_SECRET** (the staging secret, NOT `local-testing-secret`)

### Step 3: Fix .env Files if Needed

#### Option A: If JWT_SECRET is wrong
```bash
# Generate a new strong JWT_SECRET
NEW_SECRET=$(openssl rand -base64 64 | tr -d '\n')

# Update overview-api
cd /home/ec2-user/ops-dashboard/services/overview-api
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env

# Remove JWT_SECRET from upload-api (it fallsback to overview-api)
cd /home/ec2-user/ops-dashboard/services/api
sed -i '/^JWT_SECRET=/d' .env

# Or explicitly set it to match
echo "JWT_SECRET=$NEW_SECRET" >> .env
```

#### Option B: If Auth API ecosystem file is missing
```bash
cd /home/ec2-user/ops-dashboard/services/overview-api
pm2 start ecosystem.config.auth.js
pm2 save
```

### Step 4: Restart Services
```bash
pm2 restart all
pm2 logs --lines 50  # Check for errors
```

### Step 5: Verify Services Are Running
```bash
# From EC2
curl http://localhost:5106/api/health  # Auth API
curl http://localhost:5107/api/health  # Upload API
curl http://localhost:5108/api/health  # Overview API

# Test login
curl -X POST http://localhost:5106/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@settlepaisa.com", "password": "admin123"}'
```

**Should return:** JSON with `token` field (not "Error")

## Long-Term Fix

### Create Staging-Specific .env Files

We need to prevent local .env files from being deployed to staging:

1. **Add `.env` to `.gitignore`** (if not already)
2. **Create `.env.example` files** with placeholders
3. **Document staging JWT_SECRET** in secure location (1Password, AWS Secrets Manager)
4. **Use PM2 ecosystem files** with `env` section for staging config

### Example: services/api/.env.staging
```bash
# Staging Environment - DO NOT COMMIT
PORT=5107
NODE_ENV=production

# RDS Database
DB_HOST=settlepaisa-ops-rds.xxxxx.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=settlepaisa_admin
DB_PASSWORD=<FROM_AWS_SECRETS_MANAGER>

# JWT - Must match overview-api
JWT_SECRET=<STRONG_RANDOM_SECRET_80_CHARS>

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
```

## Prevention Checklist

Before deploying to staging:

1. ✅ Verify .env files on EC2 have production secrets (not local ones)
2. ✅ Verify JWT_SECRET is consistent across services
3. ✅ Run `pm2 status` to confirm all services running
4. ✅ Test login: `curl http://localhost:5106/api/auth/login`
5. ✅ Test upload with auth token
6. ✅ Check browser DevTools for 401 errors

## What I Cannot Fix Without SSH

I attempted to diagnose and fix this but **do not have SSH access** to EC2:
```
$ ssh ec2-user@52.66.199.215
Permission denied (publickey,gssapi-keyex,gssapi-with-mic)
```

**Someone with EC2 access needs to:**
1. SSH to the server
2. Check PM2 service status
3. Fix .env configuration
4. Restart services
5. Verify auth API is running

## Testing After Fix

### From Browser
1. Open: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
2. Open DevTools → Application → Storage → Clear site data
3. Refresh page
4. Login with admin credentials
5. Try uploading a file in Recon Workspace
6. Should work without 401 errors

### From Command Line
```bash
# Test login
TOKEN=$(curl -s -X POST http://52.66.199.215:5106/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@settlepaisa.com", "password": "admin123"}' \
  | jq -r '.token')

echo "Token: $TOKEN"

# Test upload with token (should NOT get 401)
curl -X POST http://52.66.199.215:5107/api/upload/multiple \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@test-pg-transactions.csv" \
  -F "fileType=pg"
```

## Summary

**Issue**: 401 Unauthorized on upload
**Root Cause**: Auth API not running + JWT_SECRET mismatch
**Fix Required**: SSH to EC2, fix .env files, restart services
**Who Can Fix**: Someone with EC2 SSH access
**ETA**: 10-15 minutes once on the server

---

**Documented**: Oct 29, 2025
**Status**: Waiting for EC2 access to apply fix
