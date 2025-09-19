# SettlePaisa 2.0 Ops Dashboard - Claude Code Context

## Project Overview
This is the SettlePaisa 2.0 Operations Dashboard - a React TypeScript application for monitoring payment reconciliation processes. The dashboard runs on **port 5174** (NOT 5173) and provides real-time insights into settlement pipelines, data sources, and system health.

## Critical Context & User Journey

### Initial Problem
- User reported: "The Ops dashboard for settlepaisa 2 was running on 5174. Bring that back"
- Dashboard was not loading due to port conflicts and data errors

### Major Implementation Request
User provided detailed specifications to completely redesign the Overview page with:
1. Service contract with specific data types
2. 8 new components to build
3. Mathematical consistency requirements
4. Specific business logic for reconciliation

### Key Corrections Made by User
1. **Connectors Definition**: "Connectors are SFTP/API connections which we have from banks so that we can do recon with PG API automatically through bank files" - NOT payment gateways like Razorpay/Paytm
2. **Data Sources**: Manual vs Connectors (bank connections), not payment gateway sources
3. **UI Requirements**: Remove graphs from TopReasons, show numbers only
4. **Consistency Requirement**: "fix and make Realistic numbers" and "wire the dashboard in such a way that all numbers become consistent" for demo purposes

### Current Architecture

**Framework Stack:**
- React 18 + TypeScript + Vite
- TanStack React Query for data fetching
- React Router for navigation
- Tailwind CSS for styling
- Lucide React for icons

**Port & Access:**
- Always runs on port 5174
- Main URL: http://localhost:5174/ops/overview
- Root "/" auto-redirects to "/ops/overview"

**Key Files:**
```
/src/pages/Overview.tsx - Main overview page
/src/services/overview.ts - Data service with seeded consistent data
/src/components/Overview/
├── Kpis.tsx - 4 KPI cards with sparklines
├── BySource.tsx - Manual vs Connectors breakdown
├── TopReasons.tsx - Exception reasons (numbers only)
├── ConnectorsHealth.tsx - Bank SFTP/API status
└── [other components]
/src/router.tsx - Route configuration
```

## Business Logic & Data Structure

### Reconciliation Pipeline (Cumulative Stages)
```
Captured (10,000) → InSettlement (8,491) → SentToBank (7,952) → Credited (7,413)
                                      ↓
                                 Unsettled (550)
```

**Critical Constraints:**
- Pipeline stages are CUMULATIVE (inSettlement includes sentToBank includes credited)
- credited ≤ sentToBank ≤ inSettlement ≤ captured
- unsettled = captured - inSettlement
- Match rate = (captured - unsettled) / captured

### Data Sources
1. **MANUAL** (3,000 txns, 88.3% match rate) - File uploads by ops team
2. **CONNECTORS** (7,000 txns, 97.1% match rate) - Automated bank SFTP/API feeds

### Bank Connectors (NOT Payment Gateways)
- HDFC Bank SFTP
- ICICI API  
- AXIS SFTP
- SBI API
- IndusInd SFTP

### Seeded Consistent Data
All numbers are mathematically related:
- Total captured: 10,000 transactions
- Manual: 3,000 (30%), Connectors: 7,000 (70%)
- Manual unsettled: 350, Connector unsettled: 200
- Total unsettled: 550
- KPIs match pipeline totals exactly
- Exception counts sum to 82 total

## Technical Issues Resolved

### Major Fixes Applied
1. **TypeError Fix**: Added null checking in Kpis component for `kpis.reconMatch?.total`
2. **Match Rate Calculation**: Fixed from `inSettlement + sentToBank + credited` to `captured - unsettled`
3. **Data Flow**: Changed from `kpis={data?.kpis || {} as any}` to `kpis={data?.kpis}`
4. **Missing Function**: Added `random()` helper in overview service
5. **Router Configuration**: Updated to use correct Overview component

### Current Status
- Dashboard loads successfully on port 5174
- All components render without errors
- Data is mathematically consistent
- Real-time updates work (30-second intervals)
- HMR (Hot Module Reload) is functioning

## Development Commands
```bash
# Start dev server (background)
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &

# Check if running
ps aux | grep vite | grep 5174

# View logs
tail -f /tmp/vite.log
```

## User's Explicit Requirements Summary
1. Port 5174 always
2. Mathematical consistency for demo
3. Connectors = Bank SFTP/API connections
4. Data sources = Manual vs Connectors
5. No graphs in TopReasons
6. Sparklines in KPIs
7. Real-time updates
8. Proper error handling
9. Indian currency formatting
10. Click navigation to other pages

## Critical Notes for Future Sessions
- NEVER confuse connectors with payment gateways
- ALWAYS maintain mathematical consistency
- Pipeline stages are cumulative, not additive
- Match rate = (captured - unsettled) / captured
- User needs this for demo purposes
- Port 5174 is non-negotiable
- Focus on bank reconciliation, not payment processing