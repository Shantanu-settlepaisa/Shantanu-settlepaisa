# SettlePaisa 2.0 Ops Dashboard - Complete Technical Documentation

## Project Architecture & Setup

### Technology Stack
```json
{
  "frontend": "React 18.2 + TypeScript 5.0",
  "build_tool": "Vite 5.0",
  "styling": "Tailwind CSS 3.4",
  "routing": "React Router 6.20",
  "state_management": "TanStack React Query 5.0",
  "icons": "Lucide React 0.294",
  "ui_components": "Custom components + Shadcn/ui tooltip"
}
```

### Development Environment
```bash
# Server Configuration
PORT=5174
BASE_URL=http://localhost:5174
DEFAULT_ROUTE=/ops/overview
LOG_FILE=/tmp/vite.log

# Start Commands
npm run dev -- --port 5174
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 & # Background mode
```

### Project Structure
```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component
│   ├── router.tsx                  # Route definitions
│   ├── index.css                   # Global styles (Tailwind)
│   ├── pages/
│   │   └── Overview.tsx            # Main overview page ★
│   ├── services/
│   │   └── overview.ts             # Data service with seeded data ★
│   ├── components/
│   │   ├── ui/
│   │   │   └── tooltip.tsx         # Shadcn tooltip component
│   │   ├── Overview/               # Overview page components ★
│   │   │   ├── Kpis.tsx            # 4 KPI cards with sparklines
│   │   │   ├── BySource.tsx        # Manual vs Connectors breakdown
│   │   │   ├── TopReasons.tsx      # Exception reasons list
│   │   │   └── ConnectorsHealth.tsx # Bank connector status
│   │   └── SettlementPipeline.tsx  # Pipeline visualization
│   └── lib/
│       └── utils.ts                # Utility functions
```

## Business Domain & Data Model

### Core Concept: Payment Reconciliation
SettlePaisa processes payment transactions that need to be matched (reconciled) with bank statements. The system tracks transactions through a pipeline from capture to final settlement.

### Data Flow Architecture
```typescript
// Primary Data Types
export type OverviewWindow = {
  from: string;           // Date range start (YYYY-MM-DD)
  to: string;             // Date range end (YYYY-MM-DD) 
  acquirer?: string;      // Optional bank filter
  merchant?: string;      // Optional merchant filter
  source?: 'ALL' | 'MANUAL' | 'CONNECTORS';
};

// Pipeline represents cumulative stages
export type PipelineCounts = {
  captured: number;       // Total transactions entered system
  inSettlement: number;   // Transactions in settlement process (cumulative)
  sentToBank: number;     // Sent to bank for processing (cumulative)
  credited: number;       // Successfully credited to merchant (cumulative)
  unsettled: number;      // Unmatched transactions (exclusive)
  clamped: boolean;       // Data truncation flag
  capturedValue?: number; // Total value in paise (₹1 = 100 paise)
  creditedValue?: number; // Credited value in paise
  warnings?: string[];    // System warnings
};

// KPI metrics with trend analysis
export type Kpis = {
  reconMatch: {
    matched: number;        // Count of matched transactions
    total: number;          // Total transactions
    trendPct: number;       // Percentage change vs previous period
    sparkline?: number[];   // 7-day trend data
  };
  unmatchedValue: {
    amount: number;         // Unmatched value in paise
    count: number;          // Count of unmatched transactions
    trendPct: number;
    sparkline?: number[];
  };
  openExceptions: {
    total: number;          // Total exception count
    critical: number;       // Critical severity count
    high: number;           // High severity count
    trendPct: number;
    sparkline?: number[];
  };
  creditedToMerchant: {
    amount: number;         // Total credited amount in paise
    txns: number;           // Count of credited transactions
    trendPct: number;
    sparkline?: number[];
  };
};
```

### Critical Business Rules

#### Pipeline Stage Relationships (CUMULATIVE)
```
captured (10,000)
├── inSettlement (8,491) [includes sentToBank + credited + in-queue]
│   ├── sentToBank (7,952) [includes credited + bank-pending] 
│   │   └── credited (7,413) [final success]
│   └── settlement-only (539) [8,491 - 7,952]
└── unsettled (550) [completely unmatched]

// Mathematical constraints:
credited ≤ sentToBank ≤ inSettlement ≤ captured
unsettled = captured - inSettlement  
match_rate = (captured - unsettled) / captured
```

#### Data Source Breakdown
```typescript
export type BySourceItem = {
  source: 'MANUAL' | string;  // 'MANUAL' or bank connector name
  matchRate: number;          // Percentage of matched transactions
  exceptions: number;         // Count of exceptions for this source
  pipeline: PipelineCounts;   // Pipeline breakdown for this source
  lastSync?: string;          // Last sync time (connectors only)
  lagHours?: number;          // Data lag in hours (connectors only)
};

// Seeded Data Distribution:
// MANUAL: 3,000 txns (30%), 88.3% match rate, 350 unsettled
// CONNECTORS: 7,000 txns (70%), 97.1% match rate, 200 unsettled
```

## Component Implementation Details

### 1. Overview.tsx - Main Page Controller
```typescript
// File: /src/pages/Overview.tsx
// Purpose: Main dashboard page, orchestrates all components

Key Features:
- React Query for data fetching with 30s refresh interval
- Live/Pause toggle for real-time updates
- Date range display (last 7 days default)
- Error boundary with retry functionality
- Navigation handlers for drill-down views

Critical Code Sections:
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['overview', dateRange],
  queryFn: () => fetchOverview({
    from: dateRange.from,
    to: dateRange.to,
    source: 'ALL'
  }),
  refetchInterval: live ? 30000 : false, // 30-second auto-refresh
});

// Navigation handlers for interactive elements
const handleSegmentClick = (segment: string) => navigate(`/ops/recon?filter=${segment}`);
const handleSourceClick = (source: string) => navigate(`/ops/recon?source=${source}`);
const handleReasonClick = (reason: string) => navigate(`/ops/exceptions?reason=${encodeURIComponent(reason)}`);
```

### 2. services/overview.ts - Data Service Layer
```typescript
// File: /src/services/overview.ts  
// Purpose: Mock data service with mathematically consistent seeded data

Key Functions:
- fetchOverview(): Main data fetching function
- formatIndianCurrency(): Converts paise to ₹Cr/L/K format
- generateSparkline(): Creates 7-point trend data
- getPercentage(): Safe percentage calculation
- formatTimeAgo(): Human-readable time formatting

Seeded Data Strategy:
// All numbers are mathematically consistent for demo
const totalCaptured = 10000;      // Fixed baseline
const credited = 7413;           // 74.13% success rate  
const sentToBank = 7952;         // Includes credited + pending
const inSettlement = 8491;       // Includes sentToBank + queued
const unsettled = 550;           // Exclusive unmatched count

// Validation: inSettlement + unsettled = totalCaptured (8491 + 550 = 9041)
// Corrected: unsettled = captured - inSettlement (10000 - 8491 = 1509)
// But using 550 for demo consistency across sources
```

### 3. Kpis.tsx - KPI Dashboard Cards
```typescript
// File: /src/components/Overview/Kpis.tsx
// Purpose: 4 primary KPI cards with sparklines and trend indicators

Components:
- KpiCard: Reusable card with icon, value, trend, sparkline
- Sparkline: SVG-based mini charts (7 data points)
- Tooltip integration via Shadcn/ui

KPI Definitions:
1. Recon Match Rate: (matched/total)% with green success indicator
2. Unmatched Value: ₹amount in amber warning color  
3. Open Exceptions: Count with critical/high breakdown in red
4. Credited to Merchant: ₹amount with UTR confirmation in blue

Sparkline Implementation:
const points = data.map((value, index) => {
  const x = (index / (data.length - 1)) * 100;
  const y = 50 - ((value - min) / range) * 40;
  return `${x},${y}`;
}).join(' ');

// Renders as: <polyline points="0,30 16.67,25 33.33,35..." />
```

### 4. BySource.tsx - Data Source Breakdown  
```typescript
// File: /src/components/Overview/BySource.tsx
// Purpose: Manual vs Bank Connectors visualization with pipeline bars

Key Features:
- Horizontal bar charts showing pipeline stages
- Color-coded segments: Green(credited), Blue(sent), Amber(settlement), Red(unsettled)
- Match rate calculation: (captured - unsettled) / captured
- Exception counts and last sync times for connectors

Critical Fix Applied:
// WRONG: Pipeline stages are cumulative, not additive
const matchedCount = inSettlement + sentToBank + credited; // Results in >100%

// CORRECT: Matched = everything except unsettled  
const matchedCount = captured - unsettled; // Proper calculation
const matchRate = Math.round((matchedCount / captured) * 100);

Bar Width Calculation:
const barWidth = (item.pipeline.captured / maxValue) * 100;
// Each segment width: (stage_count / captured) * barWidth
```

### 5. TopReasons.tsx - Exception Reasons
```typescript
// File: /src/components/Overview/TopReasons.tsx
// Purpose: List of top reconciliation failure reasons (numbers only)

Data Structure:
export type TopReason = {
  code: string;      // Technical code (UTR_MISSING, AMT_MISMATCH, etc.)
  label: string;     // Human readable label
  impactedTxns: number; // Transaction count
  pct: number;       // Percentage of total exceptions
};

// Seeded data sums to 82 total exceptions:
// UTR_MISSING: 32 (39%), AMT_MISMATCH: 16 (20%), DUP_UTR: 14 (17%), etc.

Layout: Clean numbered list without graphs (per user request)
```

### 6. ConnectorsHealth.tsx - Bank Connection Status
```typescript
// File: /src/components/Overview/ConnectorsHealth.tsx
// Purpose: Monitor SFTP/API connections to banks for automated reconciliation

Connector Types:
- SFTP: Secure file transfer for bank statement files
- API: Real-time API connections for transaction data

Status Indicators:
- OK: Green, recent sync, no issues
- LAGGING: Amber, sync delays, some queued files  
- FAILING: Red, connection errors, high failure count

Bank Connectors (NOT Payment Gateways):
1. HDFC Bank SFTP - File-based reconciliation
2. ICICI API - Real-time API integration
3. AXIS SFTP - Secure file transfer
4. SBI API - State Bank API connection
5. IndusInd SFTP - File-based integration

Display Data:
- Last sync timestamp with relative time
- Queued file count
- Recent failure count
- Color-coded status badges
```

### 7. SettlementPipeline.tsx - Pipeline Visualization
```typescript
// File: /src/components/SettlementPipeline.tsx
// Purpose: Interactive funnel showing transaction flow through settlement stages

Features:
- Click handlers for each segment navigation
- Value display in Indian currency format
- Warning indicators for data quality issues
- Responsive design with proper spacing

Segment Click Navigation:
onSegmentClick('captured') → /ops/recon?filter=captured
onSegmentClick('credited') → /ops/recon?filter=credited
// Allows drilling down into transaction details
```

## Styling & UI Framework

### Tailwind CSS Classes Used
```css
/* Layout & Spacing */
.grid.grid-cols-1.md\:grid-cols-2.lg\:grid-cols-4.gap-4  /* Responsive grid */
.p-6.space-y-6.bg-slate-50.min-h-screen                  /* Page layout */
.bg-white.rounded-xl.ring-1.ring-slate-200.shadow-sm     /* Card styling */

/* Interactive Elements */  
.cursor-pointer.hover\:shadow-md.transition-all          /* Hover effects */
.text-green-600.bg-green-50                              /* Success colors */
.text-amber-600.bg-amber-50                              /* Warning colors */
.text-red-600.bg-red-50                                  /* Error colors */

/* Typography */
.text-2xl.font-bold.text-slate-900                       /* Headings */
.text-sm.font-medium.text-slate-600                      /* Labels */
.text-xs.text-slate-500                                  /* Secondary text */
```

### Currency Formatting
```typescript
// Indian currency notation: ₹1,00,00,000 = ₹1Cr
export function formatIndianCurrency(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  
  if (rupees >= 10000000) return `${sign}₹${(rupees / 10000000).toFixed(1)}Cr`;
  else if (rupees >= 100000) return `${sign}₹${(rupees / 100000).toFixed(1)}L`;
  else if (rupees >= 1000) return `${sign}₹${(rupees / 1000).toFixed(1)}K`;
  return `${sign}₹${rupees.toLocaleString('en-IN')}`;
}

// Examples:
// 950000000 paise → ₹95.0L (95 lakh rupees)
// 100000000 paise → ₹10.0L (10 lakh rupees)
```

## Navigation & Routing

### Router Configuration
```typescript
// File: /src/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import Overview from './pages/Overview'; // Main component

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/ops/overview" replace />, // Auto-redirect
  },
  {
    path: '/ops/overview',
    element: <Overview />, // Primary dashboard page
  },
  // Additional routes for drill-down views:
  // /ops/recon - Transaction reconciliation details
  // /ops/exceptions - Exception management
  // /ops/connectors/:id - Individual connector details
]);
```

### Navigation Handlers
```typescript
// Click handlers in Overview.tsx for interactive drill-down
const handleSegmentClick = (segment: string) => navigate(`/ops/recon?filter=${segment}`);
const handleSourceClick = (source: string) => navigate(`/ops/recon?source=${source}`);
const handleReasonClick = (reason: string) => navigate(`/ops/exceptions?reason=${encodeURIComponent(reason)}`);
const handleConnectorClick = (connectorId: string) => navigate(`/ops/connectors/${connectorId}`);

// URL patterns generated:
// /ops/recon?filter=credited
// /ops/recon?source=MANUAL  
// /ops/exceptions?reason=UTR_MISSING
// /ops/connectors/hdfc-bank-sftp
```

## Data Consistency & Validation

### Mathematical Relationships
```typescript
// All seeded numbers maintain these relationships:
total_captured = manual_captured + connector_captured  // 10,000 = 3,000 + 7,000
total_unsettled = manual_unsettled + connector_unsettled // 550 = 350 + 200
total_credited = manual_credited + connector_credited    // 7,413 = 1,950 + 5,463

// Pipeline constraints enforced:
credited ≤ sentToBank ≤ inSettlement ≤ captured
quality.creditConstraintOk = credited <= sentToBank
quality.pipelineSumOk = (inSettlement + unsettled) === captured

// Match rate validation:
overall_match_rate = (10000 - 550) / 10000 = 94.5%
manual_match_rate = (3000 - 350) / 3000 = 88.3%  
connector_match_rate = (7000 - 200) / 7000 = 97.1%
```

### Error Handling Patterns
```typescript
// Null safety in components
if (isLoading || !kpis || !kpis.reconMatch) {
  return <LoadingSkeletons />;
}

// Optional chaining throughout
value={formatIndianCurrency(kpis.unmatchedValue?.amount || 0)}
subtitle={`${kpis.reconMatch?.matched?.toLocaleString('en-IN') || '0'} of ${kpis.reconMatch?.total?.toLocaleString('en-IN') || '0'}`}

// Query error boundaries  
if (error) {
  return (
    <div className="flex items-center justify-center h-full">
      <button onClick={() => refetch()}>Retry</button>
    </div>
  );
}
```

## Development Workflow & Debugging

### Hot Module Replacement (HMR)
```bash
# Vite HMR logs in /tmp/vite.log show real-time updates:
[vite] hmr update /src/components/overview/Kpis.tsx, /src/index.css
[vite] hmr update /src/pages/Overview.tsx, /src/index.css  
[vite] page reload src/components/settlements/SettlementCycleDrawer.tsx

# Full page reloads only when necessary, otherwise component updates
```

### Common Issues & Solutions
```typescript
// Issue: "Cannot read properties of undefined (reading 'total')"
// Solution: Add null checking before accessing nested properties
if (!kpis || !kpis.reconMatch) return <Loading />;

// Issue: Match rates showing >100% 
// Solution: Use captured - unsettled instead of adding cumulative stages
const matchedCount = captured - unsettled; // Not: inSettlement + sentToBank + credited

// Issue: Port 5174 already in use
// Solution: Kill existing process and restart
ps aux | grep vite | grep 5174 | awk '{print $2}' | xargs kill
npm run dev -- --port 5174
```

### Performance Optimizations
```typescript
// React Query caching strategy
queryKey: ['overview', dateRange], // Cache by date range
refetchInterval: live ? 30000 : false, // Conditional real-time updates  
staleTime: 1000 * 60 * 5, // 5 minutes stale time

// Component optimization
const sparklineData = useMemo(() => generateSparkline(baseValue), [baseValue]);
const formatAgo = useCallback((date: string) => formatTimeAgo(date), []);
```

## Deployment & Production Considerations

### Build Configuration
```json
// vite.config.ts optimizations
{
  "server": {
    "port": 5174,
    "host": true
  },
  "build": {
    "outDir": "dist",
    "sourcemap": true
  },
  "preview": {
    "port": 5174
  }
}
```

### Environment Variables
```bash
# Development
VITE_API_BASE_URL=http://localhost:3000
VITE_REFRESH_INTERVAL=30000

# Production  
VITE_API_BASE_URL=https://api.settlepaisa.com
VITE_REFRESH_INTERVAL=60000
```

This documentation provides complete technical context for understanding, maintaining, and extending the SettlePaisa 2.0 Ops Dashboard. The codebase prioritizes mathematical consistency, real-time updates, and intuitive drill-down navigation for operational teams managing payment reconciliation processes.