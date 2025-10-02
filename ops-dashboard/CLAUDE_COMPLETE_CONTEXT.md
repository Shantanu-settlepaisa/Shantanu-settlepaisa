# SettlePaisa Ops Dashboard - Complete Context for Claude

## 🎯 Critical Information
- **Current Version**: 2.1.1
- **Main URL**: http://localhost:5174/ops/recon
- **Project Path**: `/Users/shantanusingh/ops-dashboard`
- **MISSION CRITICAL**: Recon service and dashboard must NEVER go down

## 🚀 Quick Start Commands
```bash
cd /Users/shantanusingh/ops-dashboard

# Start with monitoring (RECOMMENDED)
./start-with-monitoring.sh

# Or start services individually
./start-services.sh

# Frontend only
npm run dev -- --port 5174

# Check health
./scripts/health-checker.sh
```

## 🏗️ Architecture Overview

### Frontend Stack
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand + React Query (TanStack Query)
- **UI Components**: Custom components + Lucide icons
- **Routing**: React Router v6
- **Port**: 5174 (ALWAYS use this port)

### Backend Services
1. **Recon API** (Port 5103) - CRITICAL
   - Path: `/services/recon-api`
   - Mock reconciliation engine
   - Handles job processing, results filtering
   - Express.js + Node.js

2. **Overview API** (Port 5105)
   - Path: `/services/overview-api`
   - Dashboard aggregation data
   - Pipeline metrics
   - Express.js + Node.js

3. **PG API** (Port 5101)
   - Path: `/services/mock-pg-api`
   - Mock payment gateway data
   - Transaction generation

4. **Bank API** (Port 5102)
   - Path: `/services/mock-bank-api`
   - Mock bank statement data
   - Settlement tracking

5. **Merchant API** (Port 5104)
   - Path: `/services/merchant-api`
   - Merchant-specific data

6. **Chargeback API** (Port 5106)
   - Path: `/services/chargeback-api`
   - Dispute management

### Database
- **Current**: Mock data in-memory + JSON files
- **Planned**: PostgreSQL (schema ready in `/db`)
- **Mock Data Location**: `/mock-data`, `/demo`

## 📁 Project Structure
```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── components/
│   │   ├── ManualUploadEnhanced.tsx    # Main recon upload component
│   │   ├── ConnectorsAutomated.tsx     # Automated connectors
│   │   ├── SettlementPipeline.tsx      # Settlement tracking
│   │   └── recon/
│   │       ├── ReconResultsTable.tsx   # Results display with tabs
│   │       ├── ReconKpiSnapshot.tsx    # KPI tiles
│   │       └── ManualUploadTiles.tsx   # Summary tiles
│   ├── pages/ops/
│   │   ├── ReconWorkspace.tsx          # Main reconciliation page
│   │   ├── OverviewSimple.tsx          # Active overview page
│   │   └── Overview.tsx                # Full overview (inactive)
│   ├── hooks/
│   │   ├── useReconJobSummary.ts      # Recon data fetching
│   │   ├── opsOverview.ts             # Overview metrics
│   │   └── useAnalyticsV3.ts          # Analytics data
│   ├── services/
│   │   ├── overview-aggregator.ts     # Data aggregation
│   │   └── reconciliation-engine.ts   # Recon logic
│   └── router.tsx                      # Route configuration
├── services/
│   ├── recon-api/
│   │   ├── index.js                   # Main server
│   │   ├── routes/jobRoutes.js        # Job endpoints
│   │   └── jobs/runReconciliation.js  # Job processing
│   └── overview-api/
│       └── index.js                    # Overview server
├── scripts/
│   ├── service-monitor.sh             # Auto-restart monitor
│   ├── health-checker.sh              # Health verification
│   └── version-manager.sh             # Version control
└── package.json                        # Dependencies

```

## 🔧 Key Components & Their Roles

### Frontend Components

#### ManualUploadEnhanced.tsx
- Main reconciliation workspace
- Handles file uploads (PG & Bank)
- Tab management (All, Matched, Unmatched PG/Bank, Exceptions)
- API integration for job processing
- State: `jobId`, `activeTab`, `reconResults`, `reconStats`

#### ReconResultsTable.tsx
- Displays filtered reconciliation results
- Tab-based filtering with counts
- Client-side filtering for data consistency
- Props: `rows`, `totalCount`, `matchedCount`, `exceptionsCount`, `activeTab`

#### ReconKpiSnapshot.tsx
- KPI tiles showing summary metrics
- Displays amounts in INR (converted from paise)
- Click-through navigation to filtered views

### Backend APIs

#### Recon API Endpoints
```javascript
GET /recon/jobs/:jobId/summary      # Job summary with counts & amounts
GET /recon/jobs/:jobId/counts       # Tab badge counts
GET /recon/jobs/:jobId/results      # Filtered results by status
POST /recon/run                     # Start new reconciliation
GET /recon/health                   # Health check
```

#### Overview API Endpoints
```javascript
GET /overview                       # Main dashboard metrics
GET /overview/pipeline              # Settlement pipeline data
GET /overview/analytics/v3          # Analytics data
POST /overview/recon/update         # Update recon metrics
```

## 🐛 Recent Fixes (v2.1.1)

### Tab Switching Issue
**Problem**: Duplicate transaction IDs across different status tabs
**Solution**: Added unique prefixes per status (E-, UB-, UP-, M-)
**Files Modified**: 
- `/services/recon-api/routes/jobRoutes.js` - `generateSingleResult()` function
- `/src/components/ManualUploadEnhanced.tsx` - Tab change handling

### Amount Display Issue
**Problem**: KPI tiles showing ₹0 instead of actual amounts
**Solution**: Extract amounts from API response and convert paise to rupees
**Code Fix**:
```typescript
// ManualUploadEnhanced.tsx line ~333
matchedAmount = jobSummary.breakdown.matched?.amountPaise ? 
  parseInt(jobSummary.breakdown.matched.amountPaise) / 100 : 0;
```

### Row Count Issue
**Problem**: Exceptions tab showing 20+ rows instead of 6
**Solution**: Added status-based limits in mock data generation
```javascript
// jobRoutes.js line ~222
if (status === 'EXCEPTION') maxCount = 6;
else if (status === 'UNMATCHED_BANK') maxCount = 4;
```

## 🎨 UI/UX Guidelines

### Color Scheme
- **Matched**: Green (`bg-green-100`, `text-green-800`)
- **Unmatched PG**: Amber (`bg-amber-100`, `text-amber-800`)  
- **Unmatched Bank**: Blue (`bg-blue-100`, `text-blue-800`)
- **Exceptions**: Red (`bg-red-100`, `text-red-800`)

### Status Normalization
- API returns: `exception`, `unmatchedBank`, `unmatchedPg`, `matched`
- Frontend expects: `EXCEPTION`, `UNMATCHED_BANK`, `UNMATCHED_PG`, `MATCHED`

## 🔄 Data Flow

1. **Upload Files** → ManualUploadEnhanced
2. **Process Job** → Recon API `/recon/run`
3. **Fetch Summary** → `/jobs/:jobId/summary`
4. **Display KPIs** → ReconKpiSnapshot
5. **Tab Selection** → Update `activeTab` state
6. **Fetch Results** → `/jobs/:jobId/results?status=xxx`
7. **Display Table** → ReconResultsTable with filtering

## 🚨 Critical Service Monitoring

### Service Monitor Features
- Health checks every 30 seconds
- Auto-restart up to 3 times per service
- Individual service management
- PID tracking for clean shutdowns
- Logs at `/tmp/service-monitor.log`

### Health Check Validations
- Frontend: React app loads, SettlePaisa branding present
- Recon API: `/health` returns "healthy", job processing works
- Other APIs: Basic connectivity and health endpoint

## 📊 Mock Data Structure

### Reconciliation Job
```javascript
{
  jobId: "demo-xxxxx" or "recon_xxxxx",
  status: "completed",
  counters: {
    matched: 16,
    unmatchedPg: 9,
    unmatchedBank: 4,
    exceptions: 6
  }
}
```

### Transaction Record
```javascript
{
  id: "E<jobId>001",  // Unique with status prefix
  txnId: "TXN11/09/202E001",
  utr: "UTR11/09/202E001",
  pgAmount: 150000,  // In paise
  bankAmount: 150000,
  status: "exception",  // lowercase
  reasonCode: "AMOUNT_MISMATCH",
  reasonLabel: "Amount mismatch detected"
}
```

## 🛠️ Common Issues & Solutions

### Port Already in Use
```bash
lsof -ti:5174 | xargs kill -9  # Frontend
lsof -ti:5103 | xargs kill -9  # Recon API
```

### Services Not Starting
```bash
# Check individual logs
tail -f /tmp/recon-api.log
tail -f /tmp/frontend.log

# Restart all
./start-services.sh
```

### Tab Data Mixed Up
- Check for duplicate transaction IDs
- Verify status prefix generation
- Clear React Query cache on tab change

### Amounts Showing ₹0
- Verify API returns `amountPaise` field
- Check frontend conversion (paise / 100)
- Ensure jobSummary.breakdown structure exists

## 🔐 Environment Variables
```bash
NODE_ENV=development
VITE_API_BASE_URL=http://localhost:5103
PORT=5174  # Frontend MUST use this
```

## 📦 Key Dependencies
```json
{
  "react": "^18.2.0",
  "@tanstack/react-query": "^5.x",
  "tailwindcss": "^3.x",
  "vite": "^5.x",
  "express": "^4.18.0",
  "axios": "^1.6.0",
  "lucide-react": "^0.3.0",
  "zustand": "^4.4.0"
}
```

## 🎯 Future Considerations

### Database Migration
- PostgreSQL schema ready in `/db/migrations`
- Drizzle ORM configuration prepared
- Migration scripts in `/db/setup-postgres.sh`

### Production Deployment
- Docker configs available (`docker-compose.yml`)
- Kubernetes manifests in `/infra`
- Environment-specific configs needed

### Performance Optimization
- Implement pagination for large datasets
- Add Redis caching for frequently accessed data
- Consider WebSocket for real-time updates

## 💡 Development Tips

1. **Always use port 5174** for frontend
2. **Run with monitoring** in development too
3. **Check health** before major changes
4. **Test tab switching** after any state changes
5. **Verify amounts** in both paise and rupees
6. **Use version manager** for safe rollbacks
7. **Monitor logs** during debugging

## 📝 Version Management
```bash
# Current version
./scripts/version-manager.sh current

# Create new version
./scripts/version-manager.sh tag 2.1.2

# Rollback if needed
./scripts/version-manager.sh rollback 2.1.0

# List all versions
./scripts/version-manager.sh list
```

## 🔗 Important URLs
- Dashboard: http://localhost:5174/ops/recon
- Recon API Health: http://localhost:5103/recon/health
- Overview API: http://localhost:5105/overview
- PG API: http://localhost:5101/health
- Bank API: http://localhost:5102/health

## 📌 Remember for Next Session
1. This is SettlePaisa 2.0 Ops Dashboard
2. Version 2.1.1 has all tab switching issues fixed
3. Service monitoring is critical - must never go down
4. Use `./start-with-monitoring.sh` to start
5. Frontend ALWAYS on port 5174
6. Recon API is the most critical service
7. Mock data uses unique IDs with status prefixes
8. Amounts in API are in paise, convert to rupees in frontend

---
**This context file contains everything needed to continue development in future sessions.**