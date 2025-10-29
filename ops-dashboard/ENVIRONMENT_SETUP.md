# Environment Setup & Segregation Guide

## Overview

This document defines the complete environment segregation between **Localhost** and **Staging** to ensure no conflicts, data leaks, or configuration overlaps.

---

## Environment Matrix

| Component | Localhost | Staging | Notes |
|-----------|-----------|---------|-------|
| **Frontend** | http://localhost:5174 | http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com | Vite dev server vs S3 static hosting |
| **Database** | localhost:5433 | settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432 | Docker postgres-v2 vs AWS RDS |
| **DB Name** | settlepaisa_v2 | settlepaisa_v2 | Same database name |
| **DB User** | postgres | postgres | Same user |
| **DB Password** | settlepaisa123 | SettlePaisa2024 | **Different passwords** |

---

## Port Assignments

### Localhost Services

| Service | Port | Purpose | Start Command |
|---------|------|---------|---------------|
| **Frontend (Vite)** | 5173/5174 | React dev server | `npm run dev` |
| **PG API** | 5101 | Payment gateway mock data | `node services/mock-pg-api/index.js` |
| **Bank API** | 5102 | Bank statement mock data | `node services/mock-bank-api/index.js` |
| **Recon API** | 5103 | Reconciliation engine | `node services/recon-api/index.js` |
| **Overview API** | 5108 | Dashboard overview & analytics | `node services/overview-api/index.js` |
| **Upload API** | 5109 | File upload processing | `node services/api/file-upload-v2.cjs` |
| **Analytics API** | 5107 | Settlement analytics | `node services/settlement-analytics-api/index.js` |
| **Merchant API** | 8080 | Merchant dashboard backend | `node services/merchant-api/index.js` |

### Staging Services

| Service | Port | Access |
|---------|------|--------|
| **Frontend** | N/A | S3 static website |
| **Recon API** | 5103 | http://13.201.179.44:5103 |
| **Overview API** | 5108 | http://13.201.179.44:5108 |
| **Upload API** | 5109 | http://13.201.179.44:5109 |
| **Merchant API** | 8080 | http://13.201.179.44:8080 |

### Docker Services (Localhost Only)

| Service | Port | Purpose |
|---------|------|---------|
| **PostgreSQL v1** | 5432 | Legacy database |
| **PostgreSQL v2** | 5433 | **Main database for localhost** |
| **Redis** | 6379 | Cache |
| **MinIO** | 9000, 9001 | S3-compatible storage |
| **LocalStack** | 4566 | AWS services mock |
| **SFTP** | 2222 | File transfer |

---

## Database Configuration

### Localhost Default Values

```javascript
// services/recon-api/index.js
// services/overview-api/index.js
// services/mock-pg-api/index.js
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: process.env.DB_PORT || 5433,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### Localhost Alternative Naming (file-upload-v2.cjs)

```javascript
// services/api/file-upload-v2.cjs uses different env var names
const pool = new Pool({
  user: process.env.DATABASE_USER || 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || 'settlepaisa_v2',
  password: process.env.DATABASE_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DATABASE_PORT || '5433'),
  // ... rest of config
});
```

### Staging Database (via Environment Variables)

```bash
# Set these when deploying to staging
export DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
export DB_PORT=5432
export DB_PASSWORD=SettlePaisa2024

# Alternative naming
export DATABASE_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
export DATABASE_PORT=5432
export DATABASE_PASSWORD=SettlePaisa2024
```

---

## Environment Files

### `.env.local` (Localhost - Gitignored)

```bash
# Local Development Environment
# DO NOT COMMIT THIS FILE

# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=settlepaisa123

# Alternative naming convention
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_NAME=settlepaisa_v2
DATABASE_USER=postgres
DATABASE_PASSWORD=settlepaisa123

# Service Ports
PORT_PG_API=5101
PORT_BANK_API=5102
PORT_RECON_API=5103
PORT_OVERVIEW_API=5108
PORT_UPLOAD_API=5109

# Inter-service URLs
PG_API_URL=http://localhost:5101
BANK_API_URL=http://localhost:5102
RECON_API_URL=http://localhost:5103
OVERVIEW_API_URL=http://localhost:5108

# Frontend Environment
VITE_API_BASE_URL=http://localhost:5108
VITE_OVERVIEW_API_URL=http://localhost:5108
VITE_RECON_API_URL=http://localhost:5103
VITE_UPLOAD_API_URL=http://localhost:5109
```

### `.env.development` (Localhost - Committed)

```bash
# Development Environment Configuration
VITE_API_BASE_URL=http://localhost:5106
VITE_OVERVIEW_API_URL=http://localhost:5108
VITE_RECON_API_URL=http://localhost:5103
VITE_UPLOAD_API_URL=http://localhost:5109
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=true
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
```

### `.env.staging` (Staging - Committed)

```bash
# Staging Environment Configuration
VITE_API_BASE_URL=http://13.201.179.44:5108
VITE_OVERVIEW_API_URL=http://13.201.179.44:5108
VITE_RECON_API_URL=http://13.201.179.44:5103
VITE_UPLOAD_API_URL=http://13.201.179.44:5109
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
```

### `.env.staging-ops` (Staging Ops - Committed)

```bash
# Staging Ops Dashboard Configuration
VITE_API_BASE_URL=http://13.201.179.44:5108
VITE_OVERVIEW_API_URL=http://13.201.179.44:5108
VITE_RECON_API_URL=http://13.201.179.44:5103
VITE_UPLOAD_API_URL=http://13.201.179.44:5109
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false
```

---

## Configuration Files Reference

### `vite.config.ts`

```typescript
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,  // Changed to 5174 in CLAUDE.md
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5108',  // ✅ Fixed from 5106
        changeOrigin: true,
      },
      '/ops/api': {
        target: 'http://localhost:5108',  // ✅ Fixed from 5106
        changeOrigin: true,
      },
      '^/merchant/settlement/.*': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '^/v1/merchant/.*': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}));
```

### `start-services.sh`

```bash
# Overview API - ✅ Fixed to port 5108
PORT=5108 node services/overview-api/index.js > /tmp/overview-api.log 2>&1 &

# All services:
# - PG API: 5101
# - Bank API: 5102
# - Recon API: 5103
# - Overview API: 5108 (was 5105)
# - Analytics API: 5107
```

---

## Quick Reference Commands

### Start All Localhost Services

```bash
# Method 1: Use script
./start-services.sh

# Method 2: Manual start
cd services/mock-pg-api && node index.js > /tmp/pg-api.log 2>&1 &
cd services/mock-bank-api && node index.js > /tmp/bank-api.log 2>&1 &
cd services/recon-api && node index.js > /tmp/recon-api.log 2>&1 &
cd services/overview-api && PORT=5108 node index.js > /tmp/overview-api.log 2>&1 &
cd services/settlement-analytics-api && node index.js > /tmp/analytics-api.log 2>&1 &

# Start frontend
npm run dev
```

### Stop All Services

```bash
# Kill all backend services
pkill -f 'node.*api'

# Or kill specific ports
kill $(lsof -ti:5101,5102,5103,5108,5109,5107)
```

### Check Service Status

```bash
# Check which ports are active
lsof -i :5101,5102,5103,5108,5109,5107

# Check specific service
curl http://localhost:5108/health

# Check logs
tail -f /tmp/overview-api.log
```

---

## Data Segregation

### Localhost Data (Docker postgres-v2)

```sql
-- Connect to localhost database
psql -h localhost -p 5433 -U postgres -d settlepaisa_v2

-- Typical data volume: ~15-100 test transactions
-- Purpose: Local development and testing
-- Safe to modify/delete
```

### Staging Data (AWS RDS)

```sql
-- Connect to staging database (use EC2 bastion or authorized IP)
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com -p 5432 -U postgres -d settlepaisa_v2

-- Typical data volume: ~700+ transactions
-- Purpose: Staging deployment testing
-- ⚠️ CAUTION: Treat as production-like data
```

### Data Isolation Verification

```bash
# Test localhost is using correct database
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433
});
pool.query('SELECT COUNT(*) FROM sp_v2_transactions')
  .then(r => console.log('Localhost DB transactions:', r.rows[0].count))
  .then(() => pool.end());
"

# Expected output: Localhost DB transactions: 15 (or similar small number)
```

---

## Deployment Workflows

### Localhost Development Workflow

```bash
# 1. Start Docker services
docker-compose up -d

# 2. Start backend services
./start-services.sh

# 3. Start frontend dev server
npm run dev

# 4. Access dashboard
# http://localhost:5174/ops/overview
```

### Staging Deployment Workflow

```bash
# 1. Build frontend for staging
npm run build:staging-ops

# 2. Deploy frontend to S3
aws s3 sync dist-ops/ s3://shantanu-settlepaisa-ops-staging/ --delete

# 3. Deploy backend to EC2 (manual or via deployment scripts)
# SSH to EC2, pull latest code, restart services

# 4. Access staging
# http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview
```

---

## Critical Rules

### ✅ DO

- ✅ Use `.env.local` for localhost overrides (gitignored)
- ✅ Always verify which database you're connected to before running scripts
- ✅ Use `start-services.sh` to ensure consistent port configuration
- ✅ Test on localhost before deploying to staging
- ✅ Set explicit environment variables when deploying to staging

### ❌ DON'T

- ❌ Commit `.env.local` to git
- ❌ Run localhost services pointing to staging database without explicit intention
- ❌ Hardcode staging credentials in code files
- ❌ Mix localhost and staging API URLs in the same environment
- ❌ Deploy to staging without testing on localhost first

---

## Troubleshooting

### Issue: Services connecting to wrong database

**Check:**
```bash
# Verify environment variables
echo $DB_HOST
echo $DB_PORT

# Check service logs
tail -f /tmp/overview-api.log | grep -i "database\|connected"
```

**Fix:**
```bash
# Kill services
pkill -f 'node.*api'

# Unset conflicting env vars
unset DB_HOST DB_PORT DATABASE_HOST DATABASE_PORT

# Restart with correct config
./start-services.sh
```

### Issue: Port conflicts

**Check:**
```bash
lsof -i :5108
```

**Fix:**
```bash
# Kill process using the port
kill $(lsof -ti:5108)

# Or kill all services and restart
./start-services.sh
```

### Issue: Frontend not connecting to backend

**Check:**
```bash
# Verify proxy configuration
cat vite.config.ts | grep -A 3 "'/api'"

# Verify backend is running
curl http://localhost:5108/health
```

**Fix:**
- Ensure `vite.config.ts` proxy targets port 5108
- Restart frontend dev server: `npm run dev`

---

## Environment Variable Priority

When services start, environment variables are resolved in this order:

1. **Explicitly set env vars** (highest priority)
   ```bash
   PORT=5108 node index.js
   ```

2. **`.env.local`** (gitignored, localhost-specific)
   ```bash
   DB_HOST=localhost
   ```

3. **`.env.development`** (committed, development defaults)
   ```bash
   VITE_API_BASE_URL=http://localhost:5108
   ```

4. **Code defaults** (lowest priority)
   ```javascript
   host: process.env.DB_HOST || 'localhost'
   ```

---

## Security Considerations

### Localhost

- ✅ Docker database has weak password (`settlepaisa123`) - acceptable for local dev
- ✅ No external access - bound to localhost only
- ✅ Test data only - safe to delete/recreate

### Staging

- ⚠️ AWS RDS has stronger password (`SettlePaisa2024`)
- ⚠️ Accessible from authorized IPs only (via security groups)
- ⚠️ Contains production-like data - handle with care
- ⚠️ Never commit staging credentials to git

---

## Git Configuration

### `.gitignore` Entries (Required)

```gitignore
# Environment files
.env.local
.env*.local

# Logs
/tmp/*.log
*.log

# Build outputs
dist/
dist-ops/
dist-merchant/

# Node modules
node_modules/
```

---

## Summary

This environment setup ensures:

1. **Complete Segregation**: Localhost and staging never overlap
2. **Port Consistency**: All services use fixed, documented ports
3. **Database Isolation**: Localhost uses Docker (5433), staging uses RDS (5432)
4. **Safe Development**: No risk of accidentally modifying staging data
5. **Easy Switching**: Use environment files to switch contexts

**Last Updated**: October 25, 2025
**Maintained By**: Development Team
**Status**: ✅ Active and Verified
