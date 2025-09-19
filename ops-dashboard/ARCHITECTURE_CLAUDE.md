# SettlePaisa 2.0 Ops Dashboard - Technical Documentation (Claude Context)

## Project Overview
SettlePaisa 2.0 Operations Dashboard is a comprehensive reconciliation management system for payment operations. It provides real-time monitoring, manual file uploads, automated connector-based reconciliation, and detailed analytics.

## Tech Stack

### Frontend
- **Framework**: React 18.2.0 with TypeScript 5.0.2
- **Build Tool**: Vite 4.4.5
- **Routing**: React Router DOM 6.14.1
- **State Management**: 
  - React Query (@tanstack/react-query 4.29.19) for server state
  - React Context for local state
- **Styling**: 
  - Tailwind CSS 3.3.0
  - Tailwind Forms Plugin
- **UI Components**: 
  - Custom components with Lucide React icons
  - Recharts 2.7.2 for data visualization
- **HTTP Client**: Axios 1.4.0
- **Date Handling**: date-fns 2.30.0
- **Utilities**: 
  - clsx for className management
  - uuid for unique identifiers

### Backend Services
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18.2
- **Microservices Architecture**:
  1. **Recon API** (Port 5103) - Main reconciliation service
  2. **Mock PG API** (Port 5101) - Payment gateway data simulator
  3. **Mock Bank API** (Port 5102) - Bank data simulator
  4. **Overview Service** (Port 5104) - Aggregation service (planned)
- **Libraries**:
  - cors for CORS handling
  - uuid for job IDs
  - axios for inter-service communication

### Database (Planned)
- **Primary**: PostgreSQL for transactional data
- **Tables**:
  - `reconciliation_jobs` - Job metadata and status
  - `reconciliation_results` - Individual transaction results
  - `reconciliation_exceptions` - Exception tracking
  - `connectors_config` - Connector configurations
  - `merchants` - Merchant information
  - `acquirers` - Acquirer information

### Development Tools
- **Package Manager**: npm/pnpm
- **Type Checking**: TypeScript
- **Linting**: ESLint
- **Development Server**: Vite dev server (Port 5174)

## Architecture

### Frontend Architecture

```
/src
├── pages/ops/              # Page components
│   ├── Overview.tsx        # Main dashboard
│   └── ReconWorkspace.tsx  # Reconciliation workspace
├── components/
│   ├── Overview/           # Overview page components
│   │   ├── BySourceCanonical.tsx
│   │   ├── Kpis.tsx
│   │   └── TopReasons.tsx
│   ├── recon/              # Reconciliation components
│   │   ├── ReconResultsTable.tsx
│   │   ├── FileCard.tsx
│   │   └── ReconConfigDrawer.tsx
│   ├── connectors/         # Connector components
│   │   ├── JobResultsPanel.tsx
│   │   └── ConnectorCard.tsx
│   └── ManualUploadEnhanced.tsx
├── services/               # API services
│   ├── overview.ts
│   └── overview-aggregator.ts
├── shared/                 # Shared utilities
│   └── reconMap.ts        # Data mapping utilities
└── router.tsx             # Route configuration
```

### Backend Architecture

```
/services
├── recon-api/
│   ├── index.js           # Main server
│   ├── routes/
│   │   └── jobRoutes.js   # Job-related endpoints
│   ├── jobs/
│   │   └── runReconciliation.js
│   └── seed/
│       └── reconExceptionsDemo.js
├── mock-pg-api/
│   └── index.js           # PG data simulator
└── mock-bank-api/
    └── index.js           # Bank data simulator
```

## API Endpoints

### Reconciliation API (Port 5103)

#### Job Management
- `POST /recon/run` - Start reconciliation job
- `GET /recon/jobs/:jobId` - Get job status
- `GET /recon/jobs/:jobId/summary` - Get job summary with breakdown
- `GET /recon/jobs/:jobId/results` - Get job results
- `GET /recon/jobs/:jobId/logs` - Get job logs

#### Overview & Aggregation
- `GET /recon/sources/summary` - Get aggregated summary by source type
- `GET /recon/health` - Health check

#### Connector Health
- `GET /connectors/pg/health` - PG connector health
- `GET /connectors/bank/health` - Bank connector health

### Data Models

#### JobSummary
```typescript
interface JobSummary {
  jobId: string;
  sourceType: 'manual' | 'connector';
  totals: { count: number; amountPaise: string };
  breakdown: {
    matched: { count: number; amountPaise: string };
    unmatchedPg: { count: number; amountPaise: string };
    unmatchedBank: { count: number; amountPaise: string };
    exceptions: { count: number; amountPaise: string };
  };
  byExceptionReason: Array<{
    reasonCode: string;
    reasonLabel: string;
    count: number;
  }>;
  finalized: boolean;
}
```

#### Reconciliation Status Flow
```
MATCHED → Successfully reconciled
UNMATCHED_PG → Found in PG, not in Bank
UNMATCHED_BANK → Found in Bank, not in PG
EXCEPTION → Validation or matching errors
```

## Key Features

### 1. Manual Upload
- Drag-and-drop file upload for PG and Bank files
- Auto-detection of file format and schema
- Real-time preview with reconciliation
- Support for CSV, Excel formats

### 2. Automated Connectors
- SFTP/API based bank data fetching
- Scheduled reconciliation runs
- Health monitoring and alerting
- Retry mechanisms

### 3. Reconciliation Engine
- UTR-based matching algorithm
- Amount variance tolerance
- Exception handling with reason codes
- Batch processing support

### 4. Overview Dashboard
- Real-time KPIs and metrics
- Reconciliation by source breakdown
- Top unreconciled reasons
- Data quality metrics
- Connector health monitoring

## Development Setup

### Environment Variables
```bash
# Frontend (.env)
VITE_API_BASE_URL=http://localhost:5103
VITE_ENV=development

# Backend (each service)
PORT=5103
NODE_ENV=development
DEMO_SEED_EXCEPTIONS=1  # Enable demo exception data
```

### Starting Services
```bash
# Frontend (Port 5174)
npm run dev -- --port 5174

# Backend services
cd services/recon-api && node index.js
cd services/mock-pg-api && node index.js
cd services/mock-bank-api && node index.js
```

## Data Consistency Architecture

### Single Source of Truth
- All reconciliation data flows through `reconciliation_results` table
- Job-scoped endpoints ensure data isolation
- Finalized flag distinguishes persisted vs preview jobs

### Frontend Data Flow
1. **Overview Page** → Fetches from `/recon/sources/summary` (finalized only)
2. **Manual Upload** → Fetches from `/recon/jobs/:jobId/summary`
3. **Connectors** → Fetches from `/recon/jobs/:jobId/summary`

### Money Handling
- Backend: All amounts stored as paise (string/BigInt)
- Frontend: Formatted to INR only at display layer
- Utility: `formatINR()` in `shared/reconMap.ts`

## Important Files & Locations

### Configuration
- `/Users/shantanusingh/ops-dashboard/CLAUDE.md` - Claude-specific context
- `/Users/shantanusingh/ops-dashboard/src/router.tsx` - Route definitions
- `/Users/shantanusingh/ops-dashboard/package.json` - Dependencies

### Core Components
- `/src/components/ManualUploadEnhanced.tsx` - Manual upload logic
- `/src/components/connectors/JobResultsPanel.tsx` - Job results display
- `/src/shared/reconMap.ts` - Shared data mapping utilities

### Backend Services
- `/services/recon-api/routes/jobRoutes.js` - API routes
- `/services/recon-api/jobs/runReconciliation.js` - Core reconciliation logic

## Common Issues & Solutions

### Issue: Data inconsistency between Overview and Workspace
**Solution**: Ensure all components use `breakdown` field from JobSummary, not deprecated `byStatus`

### Issue: Zero values showing as defaults
**Solution**: Use nullish coalescing (`??`) instead of logical OR (`||`) in backend

### Issue: Preview jobs appearing in Overview
**Solution**: Filter by `finalized: true` in sources/summary endpoint

## Testing

### Manual Testing Flow
1. Upload sample files via "Upload Sample Files" button
2. Check summary tiles match table counts
3. Verify Overview aggregations match individual job summaries
4. Test exception scenarios with different file combinations

### API Testing
```bash
# Create job
curl -X POST http://localhost:5103/recon/run \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-09-15","merchantId":"m1","acquirerId":"a1"}'

# Get summary
curl http://localhost:5103/recon/jobs/:jobId/summary

# Get sources overview
curl 'http://localhost:5103/recon/sources/summary?from=2025-09-01&to=2025-09-15'
```

## Deployment Considerations

### Production Readiness
- [ ] Replace mock APIs with real bank/PG connectors
- [ ] Implement PostgreSQL database layer
- [ ] Add authentication/authorization
- [ ] Set up monitoring and alerting
- [ ] Configure rate limiting
- [ ] Add request validation middleware
- [ ] Implement proper error handling
- [ ] Set up logging infrastructure

### Performance Optimization
- Implement pagination for large result sets
- Add Redis caching for frequently accessed data
- Use database connection pooling
- Implement job queue for async processing
- Add CDN for static assets

## Notes for Claude
- Always check `/Users/shantanusingh/ops-dashboard/CLAUDE.md` for latest context
- The app runs on port 5174, not 5173
- Use `formatINR()` for currency formatting, not `formatPaiseToINR()`
- JobSummary uses `breakdown` field, not `byStatus`
- All monetary values are in paise on backend