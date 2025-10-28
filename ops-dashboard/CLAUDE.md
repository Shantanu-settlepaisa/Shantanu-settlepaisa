# SettlePaisa 2.0 Ops Dashboard

## Quick Start
The Ops Dashboard is always running on port **5174**.

### Access URLs
- **Main Dashboard**: http://localhost:5174/ops/overview
- **Root URL**: http://localhost:5174/ (auto-redirects to Ops Overview)

### Starting All Services
```bash
# Start all backend services (PG API, Bank API, Recon API, Overview API)
./start-services.sh

# Start the frontend dev server
npm run dev -- --port 5174

# The server runs in background, logs are at /tmp/vite.log
```

### Backend Services
- **PG API**: Port 5101 (Mock Payment Gateway data)
- **Bank API**: Port 5102 (Mock Bank data)
- **Recon API**: Port 5103 (Reconciliation engine)
- **Overview API**: Port 5108 (Dashboard overview data)
- **Upload API**: Port 5109 (File upload processing)

## Important Context
This is the SettlePaisa 2.0 Ops Dashboard with:
- **Port**: Always 5174 (not 5173)
- **Default Page**: /ops/overview (Reconciliation Overview)
- **Framework**: React + TypeScript + Vite + Tailwind CSS

## Project Structure
```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── pages/ops/
│   │   ├── Overview.tsx           # Full-featured overview page
│   │   └── OverviewSimple.tsx     # Currently active overview page
│   ├── components/Overview/
│   │   ├── Kpis.tsx               # KPI cards with sparklines
│   │   ├── BySource.tsx           # Reconciliation by source
│   │   ├── TopReasons.tsx         # Top unreconciled reasons
│   │   ├── ConnectorsHealth.tsx   # Connector health monitoring
│   │   ├── DataQuality.tsx        # Data quality metrics
│   │   └── BankFeedLag.tsx        # Bank feed lag monitoring
│   ├── services/
│   │   └── overview.ts            # Main overview service (fetchOverview)
│   └── router.tsx                 # Routes configuration
```

## Key Features
- **Numerical Consistency**: Mutually exclusive pipeline buckets
- **Real-time Updates**: 30-second refresh interval
- **Interactive Components**: All tiles and segments clickable
- **Data Validation**: Automatic constraint checking (credited ≤ sentToBank)

## Current Configuration
- Router uses `OverviewSimple` component (line 12 in router.tsx)
- Default route "/" redirects to "/ops/overview"
- Dev server runs on port 5174 with HMR enabled

## If Server Stops
```bash
# Check if running
ps aux | grep vite | grep 5174

# Restart if needed
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
```

## Notes for Future Sessions
- Always use port 5174 for this dashboard
- The main entry point is /ops/overview
- Service function is `fetchOverview` (not fetchOverviewCounts)
- Data structure: `overview.pipeline.xxx` for pipeline data

## ⚠️ DEPLOYMENT CHECKLIST - CRITICAL

### 🚨 NEVER Deploy Only Backend OR Only Frontend
**Problem**: Environment variables (like API URLs) are baked into frontend JavaScript bundles at BUILD time, not runtime.

### The Issue That Happened (Oct 29, 2025)
1. **Earlier**: Frontend was built with localhost URLs → deployed to S3
2. **Later**: Fixed `.env` files to have staging 2 URLs
3. **Today**: Deployed backend (SSH + git pull + PM2 restart)
4. **❌ MISTAKE**: Never rebuilt/redeployed frontend
5. **Result**: S3 still had old frontend with localhost URLs → "Invalid token" errors

### ✅ Proper Deployment Process

#### When Backend Code Changes:
```bash
# 1. SSH to EC2 and deploy backend
ssh ec2-user@52.66.199.215
cd /home/ec2-user/ops-dashboard
git pull origin feat/ops-dashboard-exports
pm2 restart all
exit

# 2. NO FRONTEND REBUILD NEEDED (unless .env changed)
```

#### When Frontend Code Changes:
```bash
# Always rebuild and redeploy frontend
./deploy-frontend-staging2.sh
```

#### When .env Files Change (URLs, API Keys, etc.):
```bash
# ⚠️ CRITICAL: Must rebuild frontend AND redeploy backend

# 1. Rebuild frontend (Vite bakes .env into JavaScript)
./deploy-frontend-staging2.sh

# 2. Deploy backend
ssh ec2-user@52.66.199.215 << 'EOF'
cd /home/ec2-user/ops-dashboard
git pull origin feat/ops-dashboard-exports
pm2 restart all
EOF
```

### Deployment Scripts

#### `deploy-frontend-staging2.sh`
- ✅ Verifies `.env.staging-ops` has correct URLs
- ✅ Cleans old `dist-ops/` folder
- ✅ Rebuilds with `npm run build:staging-ops`
- ✅ Verifies build has correct URLs (not localhost)
- ✅ Deploys to S3 `settlepaisa-ops-staging-2`

**Usage:**
```bash
./deploy-frontend-staging2.sh
```

### Environment Files

#### `.env.staging-ops` (Staging 2)
```bash
VITE_UPLOAD_API_URL=http://52.66.199.215:5107
VITE_RECON_API_URL=http://52.66.199.215:5103
VITE_OVERVIEW_API_URL=http://52.66.199.215:5108
VITE_SETTLEMENT_API_URL=http://52.66.199.215:5104
VITE_FINANCIAL_API_URL=http://52.66.199.215:5105
VITE_PG_API_URL=http://52.66.199.215:5101
VITE_BANK_API_URL=http://52.66.199.215:5102
VITE_AUTH_API_URL=http://52.66.199.215:5106
```

### Quick Verification After Deployment

#### Check Frontend Build:
```bash
# Should contain staging URLs, NOT localhost
grep -r "52.66.199.215:5107" dist-ops/assets/
grep -r "http://localhost" dist-ops/assets/ | wc -l  # Should be ~0
```

#### Check Deployed Frontend:
```bash
curl -s http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com/assets/ReconWorkspaceSimplified-*.js | grep -o "http://52.66.199.215:5107"
# Should output: http://52.66.199.215:5107
```

#### Test in Browser:
1. Open DevTools (F12) → Network tab
2. Try uploading a file in Recon Workspace
3. Verify request goes to: `http://52.66.199.215:5107/api/upload/multiple`
4. Should NOT see localhost URLs

### Deployment Environments

| Environment | S3 Bucket | EC2 IP | Frontend URL |
|------------|-----------|---------|--------------|
| **Staging 2** | `settlepaisa-ops-staging-2` | 52.66.199.215 | http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com |
| **Local Dev** | N/A | localhost | http://localhost:5174 |

### Why This Matters
- **Vite bundles environment variables at BUILD time** (not runtime)
- Changing `.env` without rebuilding = old URLs stay in JavaScript
- S3 serves static files = no server-side variable substitution
- Result: Frontend calls wrong backend URLs → auth errors, 404s, CORS issues

## Database Tables - CRITICAL DISTINCTION

### Transaction Tables - DO NOT CONFUSE

| Table | Use When | Schema Key | DON'T Use When |
|-------|----------|------------|----------------|
| **`sp_v2_transactions`** | ✅ Manual uploads (CSV)<br>✅ Recon Workspace<br>✅ File upload API<br>✅ New features<br>✅ Transaction counts | • `transaction_id` VARCHAR<br>• `source_type` field<br>• BIGSERIAL id<br>• Status: PENDING/RECONCILED/EXCEPTION | ❌ Settlement calculations<br>❌ PG webhooks<br>❌ When joined with sp_v2_settlement_items |
| **`sp_v2_transactions_v1`** | ✅ PG webhook ingestion<br>✅ Settlement processing<br>✅ Reconciliation amounts<br>✅ When FK from settlement_items | • `pgw_ref` TEXT<br>• `merchant_id` UUID (FK)<br>• UUID id<br>• Status: SUCCESS/FAILED/PENDING | ❌ Manual uploads<br>❌ Recon workspace<br>❌ File processing |

### Quick Decision Rules

**Ask yourself:**
1. **Is this a file upload/manual operation?** → Use `sp_v2_transactions`
2. **Is this joined with `sp_v2_settlement_items`?** → Use `sp_v2_transactions_v1`
3. **Does it involve webhooks from Razorpay/PayU?** → Use `sp_v2_transactions_v1`
4. **Is it counting transactions?** → Probably `sp_v2_transactions`
5. **Is it calculating settlement amounts?** → Probably `sp_v2_transactions_v1`

### Service-to-Table Mapping

| Service/API | Port | Primary Table |
|------------|------|--------------|
| File Upload API | 5109 | `sp_v2_transactions` |
| Recon API | 5103 | `sp_v2_transactions` |
| PG Ingestion | N/A | `sp_v2_transactions_v1` |
| Settlement Engine | N/A | `sp_v2_transactions_v1` |
| Overview API | 5108 | **BOTH** (counts from v2, amounts from v1) |

### Current Data Status (as of Oct 2025)
- `sp_v2_transactions`: 706 rows (manual uploads)
- `sp_v2_transactions_v1`: Used by settlements (FK from sp_v2_settlement_items)

### Tables That Reference sp_v2_transactions_v1
- `sp_v2_settlement_items` (FOREIGN KEY: txn_id)
- `sp_v2_recon_matches` (via settlement_items join)

### Migration Note
DO NOT attempt to merge these tables without consulting the team. 
They have incompatible schemas (BIGSERIAL vs UUID, different status values, different FK constraints).