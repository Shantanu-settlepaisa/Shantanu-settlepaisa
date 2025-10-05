# SettlePaisa V2 Ops Dashboard - Ports & Services Reference

**Version:** 2.21.0  
**Last Updated:** October 4, 2025  
**Git Commit:** efbe72c - Version 2.21.0: Ops Dashboard - Production Export APIs (Resolve Mock Mode)

---

## 🎯 Quick Reference

| Service | Port | Status | Description |
|---------|------|--------|-------------|
| **Frontend (Vite)** | 5174 | ✅ Required | React + TypeScript dashboard |
| **PostgreSQL** | 5433 | ✅ Required | Database (Docker) |
| **Overview API** | 5105 | ✅ Required | Main API + Recon Rules |
| **Overview API V2** | 5108 | ✅ Required | V2 Dashboard Data |
| **Recon API** | 5103 | ✅ Required | Reconciliation Engine |
| **Backend (Merchant)** | 8080 | ✅ Required | Merchant API Services |
| **Merchant API** | 5106 | ⚠️ Optional | Additional merchant endpoints |
| **Settlement API** | 5109 | ⚠️ Optional | Settlement engine |

---

## 📦 Frontend

### **Vite Development Server**
- **Port:** 5174
- **Path:** `/Users/shantanusingh/ops-dashboard/`
- **Entry Point:** `src/main.tsx`
- **Config:** `vite.config.ts`

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard
npm run dev
```

**Access URLs:**
- Dashboard: http://localhost:5174
- Login: http://localhost:5174/login
- Overview: http://localhost:5174/ops/overview
- Reconciliation: http://localhost:5174/ops/reconciliation
- Exceptions: http://localhost:5174/ops/exceptions
- Settings: http://localhost:5174/ops/settings

**Key Directories:**
```
src/
├── pages/
│   ├── Login.tsx                    # Login page (v2.20.0)
│   ├── ops/
│   │   ├── Overview.tsx             # Full overview dashboard
│   │   ├── OverviewSimple.tsx       # Active overview (simplified)
│   │   ├── Reconciliation.tsx       # Recon workspace
│   │   ├── Exceptions.tsx           # Exception management
│   │   └── Settings.tsx             # Recon rules & config
│   └── merchant/
│       └── Settlements.tsx          # Merchant settlements
├── components/
│   ├── Overview/                    # Dashboard components
│   ├── ManualUploadEnhanced.tsx     # File upload UI
│   └── ConnectorsAutomated.tsx      # Connector UI
├── hooks/
│   └── opsOverview.ts               # Data fetching hooks
├── services/
│   ├── overview.ts                  # Overview API client
│   └── report-generator-v2-db.ts    # Report generation
└── features/
    └── settings/reconRules/
        ├── api.ts                   # Recon rules API client
        └── ReconRuleSettings.tsx    # Rules UI
```

**Proxy Configuration (vite.config.ts):**
```javascript
proxy: {
  '^/merchant/settlement/.*': { target: 'http://localhost:8080' },
  '^/v1/merchant/.*': { target: 'http://localhost:8080' },
  '/api': { target: 'http://localhost:5106' },
  '/ops/api': { target: 'http://localhost:5106' }
}
```

---

## 🗄️ Database

### **PostgreSQL (Docker)**
- **Port:** 5433
- **Container:** Docker Desktop
- **PID:** 94175

**Credentials:**
```
Host: localhost
Port: 5433
Database: settlepaisa_v2
User: postgres
Password: settlepaisa123
```

**Connection String:**
```
postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2
```

**Connection Test:**
```bash
# Using Node.js
node -e "const {Pool}=require('pg'); new Pool({user:'postgres',host:'localhost',database:'settlepaisa_v2',password:'settlepaisa123',port:5433}).query('SELECT version()').then(r=>console.log('✅ Connected:',r.rows[0].version)).catch(e=>console.error('❌',e.message))"

# Using curl (via Overview API)
curl http://localhost:5108/api/health
# Response: {"status":"healthy","database":"connected"}
```

**Key Tables:**
- `sp_v2_transactions` - Main transaction log
- `sp_v2_bank_statements` - Bank records
- `sp_v2_settlement_batches` - Settlement batches
- `sp_v2_settlement_items` - Settlement line items
- `sp_v2_recon_matches` - Reconciliation matches
- `sp_v2_exception_workflow` - Exception tracking
- `sp_v2_connectors` - Connector health
- `sp_v2_batch_job_logs` - Batch job logs

---

## 🔌 Backend Services

### **1. Overview API (Port 5105)**

**Location:** `services/overview-api/index.js`  
**PID:** 73188  
**Purpose:** Main dashboard API + Recon Rules

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/overview-api
node index.js > /tmp/overview-api.log 2>&1 &
```

**Endpoints:**

**Analytics:**
- `GET /api/kpis` - KPI metrics
- `GET /api/pipeline/summary` - Settlement pipeline
- `GET /api/recon/sources` - Reconciliation sources
- `GET /api/analytics/mode-stacked` - Mode breakdown
- `GET /api/analytics/gmv-trend` - GMV trends
- `GET /api/analytics/pareto` - Pareto analysis
- `GET /api/analytics/v3/*` - Analytics V3 endpoints

**Recon Rules:**
- `GET /api/recon-rules/rules` - List rules
- `GET /api/recon-rules/rules/:id` - Get rule
- `POST /api/recon-rules/rules` - Create rule
- `PUT /api/recon-rules/rules/:id` - Update rule
- `POST /api/recon-rules/rules/:id/duplicate` - Duplicate rule
- `POST /api/recon-rules/rules/:id/simulate` - Simulate rule
- `POST /api/recon-rules/rules/:id/publish` - Publish rule

**Health Check:**
```bash
curl http://localhost:5105/api/kpis
```

---

### **2. Overview API V2 (Port 5108)**

**Location:** `services/overview-api/overview-v2.js`  
**PID:** 65335  
**Purpose:** V2 dashboard data with real database queries

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/overview-api
node overview-v2.js > /tmp/overview-v2.log 2>&1 &
```

**Endpoints:**

**Dashboard Data:**
- `GET /api/overview` - Main overview data
- `GET /api/health` - Health check
- `GET /api/stats` - Database statistics
- `GET /api/connectors/health` - Connector health

**Reports:**
- `GET /api/reports/settlements` - Settlement reports
- `GET /api/reports/bank-mis` - Bank MIS reports
- `GET /api/reports/recon-outcome` - Recon outcomes
- `GET /api/reports/tax` - Tax reports

**Health Check:**
```bash
curl http://localhost:5108/api/health
# Response: {"status":"healthy","service":"v2-overview-api","database":"connected"}
```

**Example Query:**
```bash
curl "http://localhost:5108/api/overview?from=2025-10-01&to=2025-10-04"
```

**Database Connection:**
```javascript
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});
```

---

### **3. Recon API (Port 5103)**

**Location:** `services/recon-api/index.js`  
**PID:** 63021  
**Purpose:** Reconciliation engine + PG sync

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/recon-api
node index.js > /tmp/recon-api.log 2>&1 &
```

**Endpoints:**

**Reconciliation:**
- `POST /recon/run` - Start reconciliation
- `GET /recon/jobs/:jobId` - Get job status
- `GET /recon/health` - Health check

**PG Transactions:**
- `GET /pg-transactions/fetch` - Fetch PG data
- `GET /pg-transactions/check` - Check data availability
- `POST /pg-transactions/sync/manual` - Manual sync

**Exception Rules:**
- Mounted from `routes/exception-rules.js`

**Health Check:**
```bash
curl http://localhost:5103/recon/health
# Response: {"status":"healthy","activeJobs":0}
```

**Key Files:**
```
services/recon-api/
├── index.js                    # Main server
├── jobs/
│   ├── runReconciliation.js    # Core recon logic
│   └── daily-pg-sync.js        # Auto PG sync (2 AM)
├── services/
│   └── pg-sync-service.js      # PG sync service
└── routes/
    ├── pg-transactions.js      # PG API routes
    └── exception-rules.js      # Exception rules
```

**Features:**
- V1 Exception Detection (11 types)
- V2 Database Persistence
- Auto PG Sync (Daily 2 AM IST)
- Manual CSV Upload
- REPLACE logic for manual uploads
- Priority deduplication (API_SYNC > MANUAL_UPLOAD)

---

### **4. Backend / Merchant API (Port 8080)**

**PID:** 64422  
**Purpose:** Merchant API services (proxied from frontend)

**Proxied Routes:**
```javascript
// From vite.config.ts
'^/merchant/settlement/.*' → http://localhost:8080
'^/v1/merchant/.*' → http://localhost:8080
```

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/merchant-api
node server.js > /tmp/merchant-api.log 2>&1 &
```

---

### **5. Merchant API (Port 5106) - Optional**

**Location:** `services/merchant-api/`  
**Status:** ⚠️ Not currently running  
**Purpose:** Additional merchant endpoints

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/merchant-api
node index.js > /tmp/merchant-api-5106.log 2>&1 &
```

---

### **6. Settlement API (Port 5109) - Optional**

**Location:** `services/settlement-engine/settlement-api.cjs`  
**Status:** ⚠️ Not currently running  
**Purpose:** Settlement calculation engine

**Start Command:**
```bash
cd /Users/shantanusingh/ops-dashboard/services/settlement-engine
node settlement-api.cjs > /tmp/settlement-api.log 2>&1 &
```

**Features:**
- Settlement calculation (V1, V2, V3 logic)
- Auto-sync scheduler
- Manual settlement trigger
- SabPaisa config sync

---

## 🚀 Starting All Services

### **Quick Start Script**

```bash
#!/bin/bash
# Start all SettlePaisa V2 services

echo "🚀 Starting SettlePaisa V2 Ops Dashboard..."

# 1. Check PostgreSQL
lsof -i :5433 > /dev/null 2>&1 && echo "✅ PostgreSQL already running" || echo "❌ PostgreSQL not running - start Docker"

# 2. Start Overview API (port 5105)
cd /Users/shantanusingh/ops-dashboard/services/overview-api
node index.js > /tmp/overview-api.log 2>&1 &
echo "✅ Started Overview API on port 5105 (PID: $!)"
sleep 2

# 3. Start Overview API V2 (port 5108)
cd /Users/shantanusingh/ops-dashboard/services/overview-api
node overview-v2.js > /tmp/overview-v2.log 2>&1 &
echo "✅ Started Overview API V2 on port 5108 (PID: $!)"
sleep 2

# 4. Start Recon API (port 5103)
cd /Users/shantanusingh/ops-dashboard/services/recon-api
node index.js > /tmp/recon-api.log 2>&1 &
echo "✅ Started Recon API on port 5103 (PID: $!)"
sleep 2

# 5. Start Frontend (port 5174)
cd /Users/shantanusingh/ops-dashboard
npm run dev > /tmp/vite.log 2>&1 &
echo "✅ Started Frontend on port 5174 (PID: $!)"

echo ""
echo "🎉 All services started!"
echo ""
echo "Access dashboard: http://localhost:5174"
echo ""
```

### **Service Status Check**

```bash
#!/bin/bash
# Check all service status

echo "Service Status Check"
echo "===================="

check_port() {
  PORT=$1
  NAME=$2
  lsof -i :$PORT > /dev/null 2>&1 && echo "✅ $NAME (Port $PORT)" || echo "❌ $NAME (Port $PORT) - NOT RUNNING"
}

check_port 5174 "Frontend"
check_port 5433 "PostgreSQL"
check_port 5105 "Overview API"
check_port 5108 "Overview API V2"
check_port 5103 "Recon API"
check_port 8080 "Backend/Merchant API"
check_port 5106 "Merchant API (Optional)"
check_port 5109 "Settlement API (Optional)"
```

### **Stop All Services**

```bash
#!/bin/bash
# Stop all Node.js services (keeps PostgreSQL running)

echo "🛑 Stopping all Node.js services..."

pkill -f "node.*index.js"
pkill -f "node.*overview-v2.js"
pkill -f "vite"

echo "✅ All Node.js services stopped"
echo "⚠️  PostgreSQL still running (Docker)"
```

---

## 🔍 Troubleshooting

### **Check Running Processes**

```bash
# Check all Node.js processes
ps aux | grep node | grep -v grep

# Check specific ports
lsof -i :5174  # Frontend
lsof -i :5105  # Overview API
lsof -i :5108  # Overview API V2
lsof -i :5103  # Recon API
lsof -i :5433  # PostgreSQL
```

### **View Logs**

```bash
tail -f /tmp/overview-api.log      # Overview API
tail -f /tmp/overview-v2.log       # Overview API V2
tail -f /tmp/recon-api.log         # Recon API
tail -f /tmp/vite.log              # Frontend
```

### **Common Issues**

**Port Already in Use:**
```bash
# Kill process on specific port
lsof -ti :5174 | xargs kill -9
```

**Database Connection Failed:**
```bash
# Test connection
curl http://localhost:5108/api/health

# Check Docker
docker ps | grep postgres
```

**Frontend Not Loading:**
```bash
# Clear cache and restart
rm -rf node_modules/.vite
npm run dev
```

---

## 📊 Service Dependencies

```
Frontend (5174)
    ↓
    ├→ Overview API (5105) - Analytics + Recon Rules
    ├→ Overview API V2 (5108) - Dashboard Data
    ├→ Recon API (5103) - Reconciliation
    └→ Backend (8080) - Merchant Services
         ↓
    PostgreSQL (5433) - Database
```

---

## 🔐 Security Notes

**Current Configuration (Development):**
- ⚠️ No authentication (Demo mode)
- ⚠️ Database credentials in plain text
- ⚠️ CORS wide open (`*`)
- ⚠️ Any login credentials accepted

**Production Requirements:**
- [ ] JWT-based authentication
- [ ] Environment variables for credentials
- [ ] CORS whitelist
- [ ] Rate limiting
- [ ] HTTPS/TLS
- [ ] SQL injection protection (✅ using parameterized queries)

---

## 📝 Version History

- **v2.21.0** (Oct 4, 2025) - Production export APIs (resolve mock mode)
- **v2.20.0** (Oct 4, 2025) - Simplified login page
- **v2.19.0** (Oct 4, 2025) - Fixed demo data in overview
- **v2.18.0** (Oct 4, 2025) - Settlement pipeline integration
- **v2.17.0** (Oct 3, 2025) - Real-time connector health
- **v2.16.0** (Oct 3, 2025) - Settlement reports with fees
- **v2.15.0** (Oct 3, 2025) - PG auto-sync batch job
- **v2.11.0** (Oct 2, 2025) - V1 exception persistence fix
- **v2.4.0** (Oct 2, 2025) - Exception persistence + file state

---

**Last Updated:** October 4, 2025  
**Maintained By:** SettlePaisa Development Team
