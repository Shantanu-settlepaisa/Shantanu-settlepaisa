# SettlePaisa 2.0 Merchant Dashboard - Complete Context

## Overview
The SettlePaisa 2.0 Merchant Dashboard is a comprehensive settlement management system for merchants, providing real-time tracking of settlements, timeline visualization, and instant settlement capabilities.

## Access Information
- **Frontend URL**: http://localhost:5173/merchant/settlements
- **Backend API**: http://localhost:8080
- **Frontend Port**: 5173 (Vite dev server)
- **Backend Port**: 8080 (Express/Node.js)

## Architecture

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Query (@tanstack/react-query)
- **UI Components**: Custom components with shadcn/ui
- **Icons**: Lucide React
- **Routing**: React Router

### Backend Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (optional, controlled by USE_DB flag)
- **Mode**: Can run with mock data or real database

## Project Structure

```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── pages/
│   │   └── merchant/
│   │       └── Settlements.tsx          # Main settlements page
│   ├── components/
│   │   └── settlements/
│   │       ├── TimelineDrawer.tsx       # Settlement timeline visualization
│   │       └── SettlementCycleDrawer.tsx # Settlement cycle information
│   ├── lib/
│   │   └── utils.ts                     # Utility functions (formatCurrency, formatDate)
│   └── router.tsx                       # Routes configuration
├── services/
│   └── merchant-api/
│       ├── index.js                     # Main API server
│       ├── db.js                        # Database adapter
│       └── .env                         # Configuration
└── monitor-servers.sh                   # Auto-restart monitoring script
```

## Key Features

### 1. Settlement Management
- **Regular Settlements**: Standard T+1 settlements processed daily
- **Instant Settlements**: On-demand settlements processed in 10 minutes
- **Settlement Types**: 
  - Regular (daily cycle)
  - Instant/On-demand (24x7 availability)

### 2. Settlement Timeline
- Visual representation of settlement lifecycle
- Real-time status tracking with events:
  - INITIATED - Settlement request initiated
  - BATCHED - Added to settlement batch
  - BANK_FILE_AWAITED - Awaiting confirmation from the bank
  - BANK_FILE_RECEIVED - Bank confirmation received
  - RECONCILED - Amounts reconciled
  - UTR_ASSIGNED - UTR number generated
  - SETTLED - Amount credited to account
  - FAILED - Settlement failed
  - ON_HOLD - Settlement on hold

### 3. Dashboard Overview
- **Current Balance**: Available balance for settlement
- **Settlement Due Today**: Amount to be settled today
- **Previous Settlement**: Last settlement status and amount
- **Upcoming Settlement**: Next settlement date

### 4. Tab Separation
- **Settlements Tab**: Regular daily settlements
- **On-demand Settlements Tab**: Instant settlements only

## API Endpoints

### Backend API (Port 8080)
```
GET  /health/live                           # Health check
GET  /merchant/settlement/schedule          # Get settlement schedule
PUT  /merchant/settlement/schedule          # Update settlement schedule
GET  /v1/merchant/dashboard/summary         # Dashboard summary stats
GET  /v1/merchant/settlements              # List all settlements
GET  /v1/merchant/settlements/:id          # Get settlement details
GET  /v1/merchant/settlements/:id/timeline # Get settlement timeline
POST /v1/merchant/settlements/instant      # Create instant settlement
GET  /v1/merchant/insights/settlement-trend # Settlement trends
GET  /v1/merchant/insights/fees-breakdown  # Fees breakdown
```

## Data Model

### Settlement Object
```javascript
{
  id: string,                    // UUID
  type: 'regular' | 'instant',   // Settlement type
  amount: number,                 // Amount in rupees
  fees: number,                   // Processing fees
  tax: number,                    // Tax amount
  utr: string,                    // UTR number
  rrn: string,                    // RRN number
  status: 'completed' | 'processing' | 'pending' | 'failed',
  createdAt: string,              // ISO date string
  settledAt: string,              // ISO date string (optional)
  bankAccount: string,            // Bank account identifier
  transactionCount: number        // Number of transactions
}
```

### Timeline Event Object
```javascript
{
  type: string,        // Event type (INITIATED, BATCHED, etc.)
  reason?: string,     // Reason code (AWAITING_BANK_FILE, etc.)
  detail: string,      // Human-readable description
  at: string,          // ISO timestamp
  meta?: {
    expectedByIST?: string,  // Expected completion time
    bank?: string,           // Bank name
    [key: string]: any
  }
}
```

## Configuration

### Environment Variables (.env)
```bash
# Database Settings
USE_DB=false  # Toggle between mock data and real database
PG_URL=postgresql://postgres:postgres@localhost:5432/settlepaisa

# Default Merchant ID
DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111

# API Port
PORT=8080
```

## Important Business Logic

### Settlement Processing Flow
1. **PROCESSING Status Logic**:
   - Shows timeline up to BANK_FILE_AWAITED
   - Does NOT show UTR_ASSIGNED or SETTLED events
   - Displays "Settlement In Progress" alert with ETA

2. **COMPLETED Status Logic**:
   - Shows full timeline including all events
   - Includes UTR_ASSIGNED and SETTLED events

3. **Instant Settlement Rules**:
   - Available 24x7
   - Processed within 10 minutes
   - Shows in "On-demand Settlements" tab only
   - Higher fees compared to regular settlements

### Data Consistency Rules
- All amounts are stored in paise (smallest unit) in the database
- Converted to rupees for display (divide by 100)
- BigDecimal precision maintained throughout

### Date Handling
- All dates stored as ISO strings in UTC
- Displayed in IST (Indian Standard Time) on frontend
- Null-safe date formatting with fallback to '-'

## UI/UX Decisions

### Clean Interface Principles
- No promotional badges or marketing messages
- No unnecessary alerts or notifications
- Professional, data-focused design
- Clear separation between settlement types

### Status Color Coding
- **Green**: Completed/Success (bg-green-100 text-green-800)
- **Yellow**: Processing/Pending (bg-yellow-100 text-yellow-800)
- **Red**: Failed (bg-red-100 text-red-800)
- **Blue**: Informational (bg-blue-100 text-blue-800)

### Timeline Visual Design
- Vertical timeline with connecting line
- Icons for each event type
- Color-coded based on status
- Expandable reason explanations

## Common Issues & Solutions

### Issue 1: Site Not Reachable
**Solution**: Restart both servers
```bash
# Frontend
cd /Users/shantanusingh/ops-dashboard && npm run dev -- --port 5173

# Backend
cd /Users/shantanusingh/ops-dashboard/services/merchant-api && npm start
```

### Issue 2: Timeline Logic Inconsistency
**Problem**: PROCESSING status showing UTR_ASSIGNED/SETTLED events
**Solution**: Backend logic checks settlement status and returns appropriate timeline events

### Issue 3: Date Format Issues
**Problem**: "Invalid Date" displayed
**Solution**: Added null checks and safe date parsing with fallbacks

## Monitoring & Maintenance

### Auto-restart Script
Location: `/Users/shantanusingh/ops-dashboard/monitor-servers.sh`
- Checks both servers every 30 seconds
- Automatically restarts if either is down
- Logs to `/tmp/vite-5173.log` and `/tmp/merchant-api.log`

### Running the Monitor
```bash
chmod +x /Users/shantanusingh/ops-dashboard/monitor-servers.sh
./monitor-servers.sh &
```

## Recent Changes & Updates

### Latest Modifications
1. Removed promotional feature cards (Instant Settlements, 50% Off, Zero Setup Cost)
2. Removed data consistency verification message
3. Changed "Awaiting bank confirmation file" to "Awaiting confirmation from the bank"
4. Fixed timeline logic for PROCESSING settlements
5. Separated instant settlements into On-demand tab
6. Fixed date formatting issues with null checks

## Testing Checklist

### Functional Tests
- [ ] Regular settlements display correctly
- [ ] Instant settlements appear in On-demand tab only
- [ ] Timeline shows correct events for PROCESSING status
- [ ] Timeline shows full events for COMPLETED status
- [ ] Date formats display correctly (no "Invalid Date")
- [ ] Settlement amounts show in correct format (₹)
- [ ] Status badges show correct colors
- [ ] Settle Now button works
- [ ] Timeline drawer opens/closes properly
- [ ] Search and filters work correctly

### Visual Tests
- [ ] No promotional badges visible
- [ ] Clean, professional interface
- [ ] Proper spacing and alignment
- [ ] Icons display correctly
- [ ] Colors match status appropriately

## Development Commands

### Start Development Environment
```bash
# Start frontend (port 5173)
cd /Users/shantanusingh/ops-dashboard
npm run dev -- --port 5173

# Start backend API (port 8080)
cd /Users/shantanusingh/ops-dashboard/services/merchant-api
npm start

# Start monitoring script (keeps servers running)
./monitor-servers.sh &
```

### Check Server Status
```bash
# Check frontend
lsof -Pi :5173 -sTCP:LISTEN

# Check backend
lsof -Pi :8080 -sTCP:LISTEN
```

## Mock Data Configuration

### Default Mock Settlements
The backend provides mock data including:
- 5-6 sample settlements with different statuses
- Mix of regular and instant settlement types
- Realistic timeline events
- Sample UTR/RRN numbers
- Various settlement amounts

### Mock Data Characteristics
- Settlement IDs: UUID format
- Amounts: In paise, converted to rupees for display
- Dates: Recent dates (last 7 days)
- Status distribution: Mix of completed, processing, failed
- Bank names: HDFC Bank, ICICI Bank, etc.

## Future Considerations

### Potential Enhancements
1. Real-time WebSocket updates for settlement status
2. Export functionality for settlement reports
3. Advanced filtering and search capabilities
4. Settlement retry mechanisms
5. Bulk settlement operations
6. Settlement scheduling preferences

### Security Considerations
- Authentication/authorization (currently not implemented)
- Rate limiting for API endpoints
- Input validation and sanitization
- Secure handling of sensitive financial data
- Audit logging for all settlement operations

## Support & Documentation

### Key Files to Reference
1. **Frontend Main Page**: `/src/pages/merchant/Settlements.tsx`
2. **Backend API**: `/services/merchant-api/index.js`
3. **Timeline Component**: `/src/components/settlements/TimelineDrawer.tsx`
4. **Database Adapter**: `/services/merchant-api/db.js`
5. **This Documentation**: `/MERCHANT_DASHBOARD_CONTEXT.md`

### Contact Points
- Frontend runs on: http://localhost:5173/merchant/settlements
- Backend API on: http://localhost:8080
- Logs: `/tmp/vite-5173.log` and `/tmp/merchant-api.log`

---

## Quick Reference

### To Resume Development
1. Read this document first
2. Ensure both servers are running (use monitor script)
3. Access http://localhost:5173/merchant/settlements
4. Backend API at http://localhost:8080

### Key Principles
- Keep UI clean and professional
- No marketing/promotional content
- Maintain logical consistency in settlement flow
- Always handle null/undefined dates safely
- Amounts in paise in backend, rupees in frontend
- Separate instant and regular settlements clearly

### Current State
- Both servers configured and running
- Monitor script active for auto-restart
- Clean UI without promotional elements
- Timeline logic properly implemented
- Date formatting issues resolved
- Tab separation working correctly

---

Last Updated: January 2025
Version: 2.0
Status: Production Ready (Demo)