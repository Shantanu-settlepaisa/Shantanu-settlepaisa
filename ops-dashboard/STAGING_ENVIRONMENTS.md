# Staging Environment Configuration

This document explains how to configure and deploy to different staging environments.

## Environment Files

Environment files are **NOT** committed to Git for security reasons. Use the appropriate file for each environment:

### Staging 1 (Primary)
- **Server:** EC2 13.201.179.44
- **File:** `.env.staging-ops`
- **Build Command:** `npm run build -- --mode staging-ops`
- **S3 Bucket:** `settlepaisa-ops-staging`

**Configuration:**
```bash
# Staging 1 - Ops Dashboard Only
# Server: EC2 13.201.179.44

VITE_API_BASE_URL=http://13.201.179.44:5108
VITE_OVERVIEW_API_URL=http://13.201.179.44:5108
VITE_ANALYTICS_API_URL=http://13.201.179.44:5105
VITE_RECON_API_URL=http://13.201.179.44:5103
VITE_UPLOAD_API_URL=http://13.201.179.44:5109
VITE_INGEST_API_URL=http://13.201.179.44:5108
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false

VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false

VITE_MERCHANT_API_URL=http://13.201.179.44:8080
```

### Staging 2 (Secondary)
- **Server:** EC2 52.66.199.215
- **File:** `.env.staging2-ops`
- **Build Command:** `npm run build -- --mode staging2-ops`
- **S3 Bucket:** `settlepaisa-ops-staging-2`

**Configuration:**
```bash
# Staging 2 - Ops Dashboard Only
# Server: EC2 52.66.199.215

VITE_API_BASE_URL=http://52.66.199.215:5108
VITE_OVERVIEW_API_URL=http://52.66.199.215:5108
VITE_ANALYTICS_API_URL=http://52.66.199.215:5108
VITE_RECON_API_URL=http://52.66.199.215:5103
VITE_UPLOAD_API_URL=http://52.66.199.215:5107
VITE_INGEST_API_URL=http://52.66.199.215:5108
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false

VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false

VITE_MERCHANT_API_URL=http://52.66.199.215:8080
```

## Port Differences

**Staging 1:**
- Analytics API: Port **5105**
- Upload API: Port **5109**

**Staging 2:**
- Analytics API: Port **5108** (consolidated with Overview API)
- Upload API: Port **5107**

## Deployment Instructions

### Staging 1 Deployment

```bash
# 1. Ensure .env.staging-ops has Staging 1 configuration
cat .env.staging-ops | grep VITE_API_BASE_URL
# Should show: http://13.201.179.44:5108

# 2. Build frontend
npm run build -- --mode staging-ops

# 3. Deploy to S3
aws s3 sync dist-ops/ s3://settlepaisa-ops-staging/ --delete --profile staging1
```

### Staging 2 Deployment

```bash
# 1. Ensure .env.staging2-ops has Staging 2 configuration
cat .env.staging2-ops | grep VITE_API_BASE_URL
# Should show: http://52.66.199.215:5108

# 2. Build frontend
npm run build -- --mode staging2-ops

# 3. Deploy to S3
aws s3 sync dist-ops/ s3://settlepaisa-ops-staging-2/ --delete --profile staging2
```

## Database Configuration

**Both staging environments share the same database:**
- **RDS Instance:** `settlepaisa-staging`
- **Endpoint:** `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432`
- **Database:** `settlepaisa_v2`

This means:
- Transaction data is identical across both environments
- Testing on either environment affects the shared database
- Settlement records are visible on both dashboards

## Frontend URLs

| Environment | URL |
|------------|-----|
| **Staging 1** | http://settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com |
| **Staging 2** | http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com |

## Backend Service Ports

| Service | Staging 1 | Staging 2 |
|---------|-----------|-----------|
| Overview API | 5108 | 5108 |
| Analytics API | **5105** | **5108** |
| Recon API | 5103 | 5103 |
| Upload API | **5109** | **5107** |
| Settlement API | 5109 | 5109 |

## Troubleshooting

### Issue: Financial Dashboard Shows Wrong Data

**Root Cause:** Frontend built with wrong environment configuration

**Solution:**
1. Check which IP the frontend is calling:
   ```bash
   curl -s http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/assets/FinancialDashboard*.js | strings | grep -o "http://[0-9.]*:[0-9]*" | head -1
   ```
2. Should show `http://52.66.199.215:5108` for Staging 2
3. If wrong, rebuild with correct env file and redeploy

### Issue: 404 Error on Dashboard Routes

**Root Cause:** S3 website not configured for SPA routing

**Solution:**
```bash
aws s3 website s3://settlepaisa-ops-staging-2/ \
  --index-document index.html \
  --error-document index.html \
  --profile staging2
```

## Recent Changes

**October 27, 2025:**
- Fixed Financial Dashboard 404 error on Staging 2
- Separated `.env.staging-ops` (Staging 1) from `.env.staging2-ops` (Staging 2)
- Updated Staging 2 Analytics API from 5105 to 5108 (consolidated)
- Updated Staging 2 Upload API from 5109 to 5107

## Security Notes

- Environment files (`.env.*`) are gitignored and **NOT** committed to the repository
- Each developer must configure their own environment files
- AWS credentials are managed separately via AWS CLI profiles
- Database passwords are stored in environment files only

## Contact

For AWS access or environment setup, contact:
- Ops Team: ops@settlepaisa.com
- DevOps: devops@settlepaisa.com
