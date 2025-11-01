# API URL Construction Standards

## Overview

This document defines the **single source of truth** for how API URLs are constructed across the SettlePaisa Ops Dashboard to prevent duplicate path issues and deployment errors.

## Core Principle

**Base URLs contain ONLY the domain. Service clients add the full path including `/api/SERVICE/...`**

## Environment Variables

### ✅ CORRECT Format

All `VITE_*_API_URL` variables should contain ONLY the base domain:

```bash
# .env.production-ops
VITE_UPLOAD_API_URL=https://settlepaisaopsapi.sabpaisa.in
VITE_RECON_API_URL=https://settlepaisaopsapi.sabpaisa.in
VITE_OVERVIEW_API_URL=https://settlepaisaopsapi.sabpaisa.in
```

### ❌ INCORRECT Format

**NEVER** include path prefixes in environment variables:

```bash
# ❌ WRONG - will cause duplicate paths!
VITE_UPLOAD_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/upload
VITE_RECON_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/recon
```

## Service Client Pattern

All service clients (Axios instances) should:

1. Use the base URL from environment variables
2. Always include the full path with `/api/SERVICE/...` in API calls

### Example: Upload Service

**Service Client** (`src/services/upload-service.ts`):
```typescript
import axios from 'axios'

const UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_API_URL || 'http://localhost:5107'

const uploadClient = axios.create({
  baseURL: UPLOAD_API_URL,  // Just the domain
  timeout: 60000,
})
```

**API Calls** (always include full path):
```typescript
// ✅ CORRECT
await uploadClient.post('/api/upload/multiple', formData)
await uploadClient.post('/api/upload/clean-test-data', {...})

// ❌ WRONG - missing /api/upload prefix
await uploadClient.post('/multiple', formData)
```

**Result**:
- Base URL: `https://settlepaisaopsapi.sabpaisa.in`
- Path: `/api/upload/multiple`
- **Final URL**: `https://settlepaisaopsapi.sabpaisa.in/api/upload/multiple` ✅

## Why This Pattern Works

### For Staging (Direct Port Access)
```bash
VITE_UPLOAD_API_URL=http://52.66.199.215:5107
```
- Client calls: `http://52.66.199.215:5107` + `/api/upload/multiple`
- Final: `http://52.66.199.215:5107/api/upload/multiple` ✅

### For Production (ALB/Nginx Routing)
```bash
VITE_UPLOAD_API_URL=https://settlepaisaopsapi.sabpaisa.in
```
- Client calls: `https://settlepaisaopsapi.sabpaisa.in` + `/api/upload/multiple`
- Final: `https://settlepaisaopsapi.sabpaisa.in/api/upload/multiple`
- Nginx routes `/api/upload/*` → Port 5107 ✅

## Environment Files

### Approved Files

| File | Purpose | URL Pattern |
|------|---------|-------------|
| `.env.local` | Local development | `http://localhost:PORT` |
| `.env.staging-ops` | Staging 2 deployment | `http://52.66.199.215:PORT` |
| `.env.production-ops` | Production deployment | `https://settlepaisaopsapi.sabpaisa.in` |

### Deleted Files (Do NOT recreate)

- ❌ `.env.production` (conflicted with .env.production-ops)
- ❌ `.env.staging2-ops` (duplicate of .env.staging-ops)
- ❌ `.env.staging` (unclear purpose)
- ❌ `.env` (confusing, pointed to staging2)

## Service-Specific Patterns

### Upload Service (`/api/upload`)

**Endpoints**:
- `POST /api/upload/multiple` - Upload multiple files
- `POST /api/upload/clean-test-data` - Clean test data
- `POST /api/upload/single` - Upload single file

**Example**:
```typescript
await uploadClient.post('/api/upload/multiple', formData)
```

### Recon Service (`/api/recon`)

**Endpoints**:
- `POST /api/recon/recon/run` - Run reconciliation
- `GET /api/recon/jobs/:id` - Get job status
- `GET /api/recon/exceptions-v2` - Get exceptions

**Example**:
```typescript
await reconClient.post('/api/recon/recon/run', payload)
```

### Overview Service (`/api/overview`)

**Endpoints**:
- `GET /api/overview` - Get overview data
- `GET /api/exceptions/top-reasons-detailed` - Get exception reasons
- `GET /api/connectors/health` - Get connector health

**Example**:
```typescript
await fetch(`${OVERVIEW_API_URL}/api/overview?from=${from}&to=${to}`)
```

## Build-Time vs Runtime

### Important: Environment Variables are Baked at Build Time

Vite **bakes** environment variables into the JavaScript bundle during build:

```bash
npm run build:production-ops
```

This creates `dist-ops/` with **hardcoded URLs**.

**If you change `.env.production-ops`, you MUST rebuild:**

```bash
rm -rf dist-ops
npm run build:production-ops
aws s3 sync dist-ops/ s3://settlepaisa-ops-production/ --delete
aws cloudfront create-invalidation --distribution-id E2HM34NGEJZOL6 --paths "/*"
```

## Common Mistakes to Avoid

### ❌ Mistake 1: Adding Path Prefix to .env

```bash
# ❌ WRONG
VITE_UPLOAD_API_URL=https://settlepaisaopsapi.sabpaisa.in/api/upload
```

**Result**: `https://settlepaisaopsapi.sabpaisa.in/api/upload/api/upload/multiple` (duplicate!)

### ❌ Mistake 2: Omitting Path Prefix in Code

```typescript
// ❌ WRONG
await uploadClient.post('/multiple', formData)
```

**Result**: `https://settlepaisaopsapi.sabpaisa.in/multiple` (missing `/api/upload`)

### ❌ Mistake 3: Deploying Backend Only After .env Change

```bash
# ❌ WRONG
vim .env.production-ops  # Changed VITE_UPLOAD_API_URL
ssh production "cd ~/ops-dashboard && git pull && pm2 restart all"
# Frontend still has OLD URLs!
```

**Fix**: Always rebuild frontend after .env changes (use `deploy-production-complete.sh`)

### ❌ Mistake 4: Forgetting CloudFront Invalidation

```bash
# ❌ WRONG
aws s3 sync dist-ops/ s3://settlepaisa-ops-production/
# CloudFront still serves cached old version!
```

**Fix**: Always invalidate CloudFront after S3 upload

## Deployment Checklist

Before deploying to production:

- [ ] Check `.env.production-ops` has ONLY base domain URLs
- [ ] Rebuild frontend: `npm run build:production-ops`
- [ ] Validate build: `./scripts/validate-build.sh`
- [ ] Deploy to S3: `aws s3 sync dist-ops/ s3://settlepaisa-ops-production/ --delete`
- [ ] Invalidate CloudFront: `aws cloudfront create-invalidation --distribution-id E2HM34NGEJZOL6 --paths "/*"`
- [ ] Run smoke tests: `./scripts/smoke-test-production.sh`

**Or use the atomic script**:
```bash
./deploy-production-complete.sh
```

## Troubleshooting

### Issue: Getting 404 on API calls

**Check**:
1. Browser DevTools → Network tab
2. Look at the actual URL being called
3. If you see duplicate paths like `/api/upload/api/upload/...`:
   - Check `.env.production-ops` - it should NOT have path prefixes
   - Rebuild frontend
4. If you see missing `/api/` prefix:
   - Check service client code - it should include full path

### Issue: Changes to .env not taking effect

**Cause**: Frontend wasn't rebuilt (Vite bakes env vars at build time)

**Fix**:
```bash
rm -rf dist-ops
npm run build:production-ops
./deploy-production-complete.sh
```

### Issue: Still seeing old version after deployment

**Cause**: CloudFront cache

**Fix**:
```bash
aws cloudfront create-invalidation \
  --distribution-id E2HM34NGEJZOL6 \
  --paths "/*"
```

## Architecture Reference

### Staging 2 (Direct Port Access)

```
Browser → http://52.66.199.215:5107/api/upload/multiple
          └─> Directly to Upload Service (Port 5107)
```

### Production (Nginx + ALB Routing)

```
Browser → https://settlepaisaopsapi.sabpaisa.in/api/upload/multiple
          └─> CloudFront
              └─> Nginx (Port 80)
                  └─> Routes /api/upload/* → Port 5107
                      └─> Upload Service
```

## Contact

For questions or clarifications, see:
- `CLAUDE.md` - General project documentation
- `PRODUCTION_DEPLOYMENT_WORKFLOW.md` - Deployment guide
- Nginx config: `/etc/nginx/conf.d/settlepaisa-ops-api.conf` (on production EC2)
