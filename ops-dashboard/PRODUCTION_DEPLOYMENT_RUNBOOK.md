# Production Deployment Runbook

**Last Updated:** November 1, 2025
**Production Account ID:** 152271395950
**Production Domain:** https://settlepaisaops.sabpaisa.in
**Production API:** https://settlepaisaopsapi.sabpaisa.in

---

## Critical Environment Variable Discovery

### The Root Cause of Localhost References

On November 1, 2025, we discovered that `.env.production` was **MISSING critical environment variables**:

**Missing Variables:**
- `VITE_API_BASE_URL` (used by analytics and multiple services)
- `VITE_ANALYTICS_API_URL`
- `VITE_INGEST_API_URL`
- Module flags (VITE_ENABLE_OPS_DASHBOARD, etc.)

**Impact:** Services fell back to hardcoded `localhost` defaults, breaking production.

**Solution:** Always ensure `.env.production` has ALL variables before building.

---

## Prerequisites

### 1. AWS Credentials
```bash
# Verify production profile exists
cat ~/.aws/credentials | grep "\[production\]"

# Test access
AWS_PROFILE=production aws s3 ls s3://settlepaisa-ops-production
```

### 2. Git Branch Setup
```bash
# Ensure production branch exists
git branch -a | grep production

# Verify production branch is up to date
git checkout production
git pull origin production
```

---

## Environment Files Reference

### `.env.production` (CRITICAL - Used by Vite Build)
This is the file Vite uses when you run `npm run build:production`.

**Location:** `/Users/shantanusingh/ops-dashboard/.env.production`

**Required Variables:**
```bash
# Production - Ops Dashboard Only
# Server: ALB (Load Balancer) → EC2 15.207.207.203

# API Configuration - PRODUCTION (HTTPS via Custom Domain)
VITE_API_BASE_URL=https://settlepaisaopsapi.sabpaisa.in
VITE_OVERVIEW_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/overview
VITE_ANALYTICS_API_URL=https://settlepaisaopsapi.sabpaisa.in
VITE_RECON_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/recon
VITE_UPLOAD_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/upload
VITE_INGEST_API_URL=https://settlepaisaopsapi.sabpaisa.in
VITE_SETTLEMENT_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/settlement
VITE_FINANCIAL_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/financial
VITE_PG_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/pg
VITE_BANK_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/bank
VITE_AUTH_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/auth
VITE_CHARGEBACK_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/chargeback
VITE_EXPORTS_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/exports
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false

# Module Enablement - OPS ONLY
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false

# Merchant Dashboard Configuration (disabled)
VITE_MERCHANT_API_URL=http://15.207.207.203:8080
```

**Verification After Edit:**
```bash
# Check file contains all required variables
grep -E "VITE_(API_BASE_URL|ANALYTICS_API_URL|INGEST_API_URL)" .env.production
```

---

## Deployment Steps

### Step 1: Verify Environment File

**CRITICAL:** Always check `.env.production` before building!

```bash
cd /Users/shantanusingh/ops-dashboard

# Verify all critical variables are present
cat .env.production | grep -E "VITE_(API_BASE_URL|OVERVIEW_API_URL|ANALYTICS_API_URL|RECON_API_URL|UPLOAD_API_URL|INGEST_API_URL|SETTLEMENT_API_URL|FINANCIAL_API_URL|PG_API_URL|BANK_API_URL|AUTH_API_URL|CHARGEBACK_API_URL|EXPORTS_API_URL|USE_MOCK_API|DEMO_MODE|ENABLE_OPS_DASHBOARD|ENABLE_MERCHANT_DASHBOARD)"

# Count: Should be 17 lines
cat .env.production | grep -E "^VITE_" | wc -l
```

**Expected output:** 17 lines

**If missing variables:** Edit `.env.production` and add missing variables from the reference above.

---

### Step 2: Build Production Frontend

```bash
# Clean previous build
rm -rf dist

# Build with production environment
npm run build:production

# This runs: vite build --mode production
# Which loads .env.production
```

**Verification:**
```bash
# 1. Verify production URLs are in build (should find 15+ references)
grep -r "settlepaisaopsapi.sabpaisa.in" dist/assets/ | wc -l

# 2. Check for localhost references (should be < 15, mostly in mock code)
grep -r "localhost" dist/assets/ | wc -l

# 3. Verify critical services use production URLs
grep -o "https://settlepaisaopsapi.sabpaisa.in[^\"']*" dist/assets/AnalyticsV3-*.js | head -1
# Should output: https://settlepaisaopsapi.sabpaisa.in/api/analytics

# 4. Check build size (dist/ should be ~5-6 MB)
du -sh dist/
```

**If localhost count > 20:** Stop! Re-check `.env.production` and rebuild.

---

### Step 3: Deploy to Production S3

```bash
# Deploy using production AWS profile
AWS_PROFILE=production aws s3 sync dist/ s3://settlepaisa-ops-production --delete --region ap-south-1
```

**What `--delete` does:** Removes old files that are no longer in `dist/`. This prevents orphaned old versions from consuming space.

**Expected Output:**
- Upload 200+ files
- Delete 100+ old files
- Should complete in 30-60 seconds

**Verification:**
```bash
# Check S3 bucket contents
AWS_PROFILE=production aws s3 ls s3://settlepaisa-ops-production/assets/ | head -20

# Verify index.html was updated (should show today's date)
AWS_PROFILE=production aws s3 ls s3://settlepaisa-ops-production/index.html
```

---

### Step 4: Test Production Frontend

**1. Open in Browser:**
```
https://settlepaisaops.sabpaisa.in
```

**2. Open DevTools (F12) → Network Tab**

**3. Verify API Calls:**
- Login request should go to: `https://settlepaisaopsapi.sabpaisa.in/api/auth/login`
- Overview data should go to: `https://settlepaisaopsapi.sabpaisa.in/api/overview`

**4. Check for Errors:**
- No CORS errors
- No 404s for static assets
- No localhost URLs in network requests

**5. Test Key Functionality:**
- Login with production credentials
- View Ops Overview page
- Check Analytics dashboard loads
- Test file upload (if applicable)

---

## Common Issues & Solutions

### Issue 1: "localhost" URLs in Production Build

**Symptoms:**
- `grep -r "localhost" dist/assets/ | wc -l` returns > 20
- Network tab shows requests to `http://localhost:5107`, `http://localhost:5108`, etc.

**Root Cause:**
- `.env.production` missing critical variables
- Services fall back to hardcoded localhost defaults

**Solution:**
```bash
# 1. Verify .env.production has ALL required variables
cat .env.production | grep -E "^VITE_" | wc -l
# Should return 17

# 2. If missing, add all variables from "Environment Files Reference" above

# 3. Clean and rebuild
rm -rf dist
npm run build:production

# 4. Verify again
grep -r "settlepaisaopsapi.sabpaisa.in" dist/assets/ | wc -l
# Should be 15+
```

---

### Issue 2: Access Denied When Deploying to S3

**Symptoms:**
```
fatal error: An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied
```

**Root Cause:**
- Using wrong AWS profile
- Production credentials not configured

**Solution:**
```bash
# 1. Check available profiles
cat ~/.aws/credentials | grep "^\["

# 2. Use production profile (NOT staging2)
AWS_PROFILE=production aws s3 sync dist/ s3://settlepaisa-ops-production --delete --region ap-south-1

# 3. If production profile doesn't exist, configure it
aws configure --profile production
# Enter production AWS Access Key ID
# Enter production AWS Secret Access Key
# Region: ap-south-1
# Output format: json
```

---

### Issue 3: CORS Errors in Production

**Symptoms:**
- Browser console shows CORS errors
- API calls fail with "Access-Control-Allow-Origin" errors

**Root Cause:**
- Backend not configured to allow frontend domain
- ALB/CloudFront not configured properly

**Solution:**
1. Check ALB CORS configuration
2. Verify backend services allow `https://settlepaisaops.sabpaisa.in`
3. Check CloudFront behavior settings

---

## Backend Deployment (Separate Process)

**Note:** Frontend and backend are deployed separately.

### Backend Structure on Production EC2

**EC2 IP:** 15.207.207.203
**Git Repository:** /home/ec2-user/ops-dashboard (may not be initialized)
**Working Directory:** /home/ec2-user/ops-dashboard

### Current Backend Status (Nov 1, 2025)

**Known Issues:**
- Production EC2 was originally deployed via tarball (not git)
- Some services have missing .env files
- PM2 configuration may need updating

**Recommended Approach:**
1. Use working backup with .env files
2. Keep git repository separate for code updates
3. Deploy backend via secure file transfer, not git clone

---

## Rollback Procedure

### If Production Frontend is Broken

**Option 1: Rollback S3 to Previous Version**

S3 versioning should be enabled. If not, you'll need Option 2.

```bash
# List previous versions
AWS_PROFILE=production aws s3api list-object-versions --bucket settlepaisa-ops-production --prefix index.html

# Restore specific version (replace VERSION_ID)
AWS_PROFILE=production aws s3api copy-object \
  --copy-source settlepaisa-ops-production/index.html?versionId=VERSION_ID \
  --bucket settlepaisa-ops-production \
  --key index.html
```

**Option 2: Rebuild from Staging2**

```bash
# 1. Checkout staging2 (known working state)
git checkout feat/ops-dashboard-exports
git pull origin feat/ops-dashboard-exports

# 2. Build with staging2 env (temporarily)
npm run build:staging-ops

# 3. Deploy to production (emergency only)
AWS_PROFILE=production aws s3 sync dist-ops/ s3://settlepaisa-ops-production --delete --region ap-south-1

# 4. Update .env.production to match staging URLs (temporary)
```

---

## Git Workflow

### Standard Workflow

```bash
# 1. Work on Staging2
git checkout feat/ops-dashboard-exports
# Make changes, test on staging2

# 2. Merge to Production Branch
git checkout production
git merge feat/ops-dashboard-exports
git push origin production

# 3. Deploy Frontend (this runbook)

# 4. Deploy Backend (separate process - see above)
```

---

## Production Infrastructure

### S3 Bucket
- **Bucket Name:** settlepaisa-ops-production
- **Region:** ap-south-1 (Mumbai)
- **Static Website Hosting:** Enabled
- **Public Access:** Enabled (for static website)

### CloudFront (if configured)
- **Distribution Domain:** https://settlepaisaops.sabpaisa.in
- **Origin:** S3 bucket static website endpoint

### Backend EC2
- **IP:** 15.207.207.203
- **Services:** 8 PM2 processes (overview-api, upload-api, recon-api, settlement-api, settlement-queue-processor, pg-ingestion, chargeback-api, exports-api)
- **Port Mapping:**
  - 5103: recon-api
  - 5107: upload-api
  - 5108: overview-api (includes auth)
  - 5110: settlement-api
  - 5111: pg-ingestion
  - 5112: chargeback-api
  - 5113: exports-api

### ALB (Application Load Balancer)
- **Domain:** https://settlepaisaopsapi.sabpaisa.in
- **Target:** EC2 15.207.207.203
- **Routing:** Path-based routing to different backend ports

---

## Checklist: Before Each Deployment

- [ ] `.env.production` has all 17 required VITE_ variables
- [ ] Production git branch is up to date
- [ ] AWS production profile is configured
- [ ] Build completed without errors
- [ ] `settlepaisaopsapi.sabpaisa.in` URLs found in dist/ (15+)
- [ ] localhost references are minimal (< 15, in mock code only)
- [ ] S3 deployment completed successfully
- [ ] Production frontend URL tested in browser
- [ ] Login works with production credentials
- [ ] No console errors in DevTools
- [ ] Network tab shows HTTPS API calls (not localhost)

---

## Emergency Contacts

- **DevOps Team:** [Add contact]
- **AWS Account Owner:** [Add contact]
- **Production Access:** Account ID 152271395950

---

## Appendix: Build Modes

Vite supports multiple build modes via `--mode` flag:

| Command | Mode | Env File | Use Case |
|---------|------|----------|----------|
| `npm run build:production` | production | `.env.production` | Production deployment |
| `npm run build:staging-ops` | staging-ops | `.env.staging-ops` | Staging 2 deployment |
| `npm run build:staging-merchant` | staging-merchant | `.env.staging-merchant` | Merchant dashboard staging |

**Key Insight:** The mode name must match the env file suffix.

---

**End of Runbook**
