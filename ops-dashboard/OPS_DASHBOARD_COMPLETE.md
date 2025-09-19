# SettlePaisa Ops Dashboard - Complete Implementation

## Overview

The **SettlePaisa Ops Dashboard** is a powerful, production-grade operations console designed for PA/PG→Bank→Merchant reconciliation workflows. Built with React 18, TypeScript, and Tailwind CSS, it provides real-time monitoring, reconciliation management, and comprehensive analytics for sp-ops, sp-finance, and sp-compliance roles.

## Key Features

### 1. **Operations Overview**
- Real-time KPI monitoring (reconciliation status, unmatched values, exceptions, settlement values)
- Settlement progress tracker with stage-wise breakdown
- Exception queue snapshot with severity-based prioritization
- Data source connectivity monitoring

### 2. **Reconciliation Workspace** ✨ *Enhanced*
- **Multi-file Upload**: Drag-drop support for both PG and Bank files
- **Schema Detection**: Auto-detects file type, delimiter, encoding, headers
- **File Validation**: MD5 checksum, size validation, format verification  
- **Preview System**: Collapsible tables showing first 5 rows of uploaded files
- **Template-based Normalization**: Field mapping with auto-suggestions
- **Auto-matching**: Automatic reconciliation when both files uploaded
- **Real-time Results**: Live table with All/Matched/Exceptions filtering
- **Full-height Config Drawer**: Fit-to-page configuration interface
- **Export Ready**: CSV/Excel export functionality
- **Job Tracking**: Unique job IDs with timestamps and progress tracking

### 3. **Settlement Details**
- Comprehensive settlement breakdown (fees, taxes, adjustments)
- Transaction-level drill-down
- Timeline view of settlement lifecycle
- Variance analysis and reconciliation

### 4. **Exception Management**
- Work queue with filtering and assignment
- Detailed exception investigation drawer
- Resolution workflow with audit trail
- Bulk operations support

### 5. **Data Sources**
- Real-time connectivity monitoring
- Sync lag detection and alerts
- Manual recheck capabilities
- Error tracking and history

### 6. **Analytics & Reports**
- Settlement trend analysis
- Payment method distribution
- Fee percentage tracking
- Exception rate monitoring
- Automated report generation

## Technical Architecture

### Frontend Stack
```
React 18 + TypeScript
Vite (Build tool)
TanStack Query (State management)
React Router v6 (Routing)
Tailwind CSS (Styling)
Lucide React (Icons)
Recharts (Data visualization)
Zustand (Auth state)
```

### Core Principles
- **Money in Paise**: All monetary values as integers (1 INR = 100 paise)
- **IST Timezone**: All times in Asia/Kolkata, 18:00 IST cutoff
- **Idempotency**: All mutations with X-Idempotency-Key
- **RBAC**: Role-based access (sp-ops, sp-finance, sp-compliance)
- **Mock-First**: Complete mock API for development

## Project Structure

```
ops-dashboard/
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── KpiCard.tsx
│   │   ├── ProgressTracker.tsx
│   │   ├── ExceptionSnapshot.tsx
│   │   ├── DataSourceStatus.tsx
│   │   └── ProtectedRoute.tsx
│   ├── layouts/            # Layout components
│   │   └── OpsLayout.tsx
│   ├── lib/               # Utilities and API
│   │   ├── api-client.ts
│   │   ├── ops-api.ts
│   │   ├── mock-ops-data.ts
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── pages/             # Page components
│   │   ├── Login.tsx
│   │   ├── Unauthorized.tsx
│   │   └── ops/
│   │       ├── Overview.tsx
│   │       ├── ReconWorkspace.tsx
│   │       ├── SettlementDetails.tsx
│   │       ├── Exceptions.tsx
│   │       ├── DataSources.tsx
│   │       ├── Analytics.tsx
│   │       └── Settings.tsx
│   ├── router.tsx         # Application routing
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── .env.development
```

## API Endpoints

### Overview APIs
```typescript
GET /ops/overview/metrics        // KPI metrics
GET /ops/overview/progress       // Settlement progress
GET /ops/overview/exceptions     // Exception snapshot
GET /ops/overview/datasources    // Data source status
```

### Reconciliation APIs
```typescript
GET  /ops/recon/jobs             // List recon jobs
POST /ops/recon/files/upload     // Upload file
POST /ops/recon/normalize        // Normalize data
POST /ops/recon/match           // Match transactions
GET  /ops/recon/templates       // List templates
POST /ops/recon/templates       // Save template
```

### Settlement APIs
```typescript
GET /ops/settlements/:id              // Settlement details
GET /ops/settlements/:id/transactions // Transactions
GET /ops/settlements/:id/variances    // Variances
```

### Exception APIs
```typescript
GET  /ops/exceptions              // List exceptions
POST /ops/exceptions/:id/resolve  // Resolve exception
```

### Analytics APIs
```typescript
GET  /ops/analytics/:type        // Get analytics data
POST /ops/mis/reports            // Generate report
GET  /ops/mis/reports/:id        // Get report status
```

## RBAC Implementation

### Role Definitions
```typescript
type UserRole = 
  | 'sp-ops'        // Full operations access
  | 'sp-finance'    // Financial operations
  | 'sp-compliance' // Compliance and audit
  | 'auditor'       // Read-only audit access
  | 'merchant-admin'// Merchant admin (no ops access)
  | 'merchant-ops'  // Merchant ops (no ops access)
```

### Access Control
- `/ops/*` routes restricted to sp-ops, sp-finance, sp-compliance
- Automatic redirect to `/unauthorized` for other roles
- Role-based UI element visibility
- API-level authorization via X-User-Role header

## Key Components

### KPI Card
```typescript
<KpiCard
  title="Reconciliation Status"
  value="87%"
  subtitle="12,453 of 14,312 matched"
  icon={CheckCircle}
  trend={{ value: 3.2, direction: 'up' }}
  color="green"
/>
```

### Progress Tracker
```typescript
<ProgressTracker 
  stages={[
    { name: 'Captured', status: 'completed', count: 14312, valuePaise: 10234500000, percentage: 35 },
    { name: 'In Settlement', status: 'active', count: 12890, valuePaise: 9234500000, percentage: 30 },
    // ...
  ]}
/>
```

### Exception Management
```typescript
<ExceptionSnapshot 
  exceptions={[
    { id: 'EXC-001', type: 'refund_mismatch', severity: 'critical', aging: '3h 24m', status: 'investigating' },
    // ...
  ]}
/>
```

## Mock Data System

### Configuration
```env
VITE_USE_MOCK_API=true
VITE_DEMO_MODE=true
VITE_API_BASE_URL=http://localhost:8080
```

### Mock Data Features
- Realistic Indian merchant names
- Proper transaction flows
- Time-based data generation
- Status progression simulation
- Error state examples

## Getting Started

### Installation
```bash
cd ops-dashboard
npm install
```

### Development
```bash
npm run dev
# Dashboard runs on http://localhost:5174
```

### Build
```bash
npm run build
```

### Environment Variables
Create `.env.development`:
```env
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK_API=true
VITE_DEMO_MODE=true
```

## Demo Credentials

In demo mode, any credentials work. Select role during login:
- **Operations**: sp-ops role
- **Finance**: sp-finance role  
- **Compliance**: sp-compliance role

## Reconciliation Workflow

### 1. File Upload
- Manual upload or SFTP/API ingestion
- Checksum validation (MD5/SHA256)
- Duplicate detection
- Schema validation

### 2. Normalization
- Template selection or creation
- Field mapping configuration
- Transform functions (date, amount)
- Preview before processing

### 3. Matching
- Multiple strategies (UTR, RRN, heuristic)
- Confidence scoring
- Tolerance configuration
- Exception generation

### 4. Exception Resolution
- Investigation with raw/normalized data
- Resolution actions (ignore, link, adjust)
- Audit trail maintenance
- Bulk operations

## Performance Optimizations

### Frontend
- Code splitting with React.lazy
- Query caching with TanStack Query
- Virtual scrolling for large lists
- Debounced search inputs
- Optimistic UI updates

### API
- Cursor-based pagination
- Field selection
- Response caching
- Batch operations
- WebSocket for real-time updates (planned)

## Security Features

### Authentication
- JWT-based authentication
- Secure token storage
- Auto-logout on 401
- Session management

### Authorization
- Role-based access control
- Resource-level permissions
- API authorization headers
- UI element visibility control

### Data Security
- All amounts in paise (integer math)
- Idempotency for mutations
- Audit trail for all actions
- PII minimization

## Testing Strategy

### Unit Tests
- Utility functions
- Component logic
- API client methods
- Mock data generators

### Integration Tests
- Page workflows
- API integration
- Role-based access
- Error handling

### E2E Tests
- Complete reconciliation flow
- Exception resolution
- Report generation
- Multi-role scenarios

## Production Deployment

### Build Configuration
```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          utils: ['date-fns', 'axios'],
        },
      },
    },
  },
})
```

### Docker Deployment
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

### Environment Configuration
```bash
# Production
VITE_API_BASE_URL=https://api.settlepaisa.com
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
```

## Monitoring & Observability

### Metrics
- Page load performance
- API response times
- Error rates
- User activity tracking

### Logging
- Structured JSON logs
- Error boundary catching
- API error tracking
- User action logging

### Alerts
- Failed reconciliation jobs
- SLA breaches
- High exception rates
- System errors

## Future Enhancements

### Phase 2
- [ ] WebSocket real-time updates
- [ ] Advanced filtering and search
- [ ] Bulk file processing
- [ ] Custom dashboard widgets
- [ ] Export to multiple formats

### Phase 3
- [ ] ML-based matching algorithms
- [ ] Predictive exception detection
- [ ] Automated resolution suggestions
- [ ] Voice-enabled operations
- [ ] Mobile responsive design

## Support & Maintenance

### Documentation
- Component Storybook: `/docs/components`
- API Documentation: `/docs/api`
- User Guide: `/docs/user-guide`

### Troubleshooting
- Check browser console for errors
- Verify API connectivity
- Check role permissions
- Review audit logs

### Contact
- Engineering: engineering@settlepaisa.com
- Operations: ops@settlepaisa.com
- Support: support@settlepaisa.com

---

## Recent Enhancements (2025-09-11) ✨

### **OP-RECON-RESULTS-FIX Implementation**

#### **Enhanced Reconciliation Workspace**
- **Header Improvements**: Trimmed helper text to single line: "Auto-detects and normalizes bank files using Recon Config."
- **Single-line CTAs**: Upload Sample Files and Recon Config buttons with proper wrapping
- **Always Visible Results**: Transactions table visible by default (not hidden/collapsed)
- **Auto-trigger Reconciliation**: Automatic processing when both PG and Bank files uploaded
- **Loading States**: Skeleton rows during processing with proper transitions

#### **Full-height Config Drawer**
- **Fit-to-page Design**: 920px width, 92vw max-width, full viewport height
- **Proper Z-layering**: z-[70] ensures drawer appears above all content
- **Sticky Header/Footer**: Fixed header and footer with scrollable content area
- **Clean Interface**: Simplified close button and streamlined layout

#### **Enhanced Results Table**
- **Complete Column Set**: Checkbox, TXN ID, UTR/RRN, PG Amount, Bank Amount, Δ, PG Date, Bank Date, Status, Actions
- **Sticky Headers**: Table headers remain visible during scrolling
- **Status Chips**: Color-coded status indicators (Matched=green, Mismatched=red, etc.)
- **Currency Formatting**: Proper INR formatting with delta calculations
- **Tab Filtering**: All/Matched/Exceptions tabs with real-time filtering
- **Export Functionality**: CSV/Excel export dropdown ready

#### **Multi-file Upload System**
- **FileCard Components**: Reusable cards for PG and Bank file uploads
- **Drag-and-Drop**: Full drag-drop support with visual feedback
- **File Validation**: Auto-detection of file type, delimiter, encoding
- **Schema Badges**: Visual indicators for file validity and recognized schemas
- **Preview Tables**: Collapsible previews showing first 5 rows of data
- **MD5 Checksums**: File integrity validation with truncated display
- **Multi-file Support**: Add multiple files per category with individual management

#### **Improved Data Flow**
- **Mock Data Integration**: Pre-populated with realistic transaction data
- **Job ID Tracking**: Unique job identifiers with timestamps
- **Progress Indicators**: Loading states and completion feedback
- **Error Handling**: Graceful error states and recovery options

#### **Technical Components Added**
```typescript
// New Components
src/components/recon/FileCard.tsx           // Multi-file upload cards
src/components/recon/ReconStats.tsx         // Insight tiles component  
src/components/recon/ReconResultsTable.tsx  // Enhanced results table
src/components/recon/ReconConfigDrawer.tsx  // Full-height config drawer

// Enhanced Components
src/components/ManualUploadEnhanced.tsx     // Main workspace container
```

#### **URL Access**
- **Development**: http://localhost:5174/ops/recon
- **Status**: All changes live and functional
- **Server**: Node.js Vite dev server on port 5174

---

## Acceptance Criteria ✅

- [x] **Overview**: KPIs show matched %, unmatched ₹, exceptions, settlement value
- [x] **Progress Tracker**: Stage-wise settlement breakdown with counts
- [x] **Exception Queue**: Top 8 by severity with type, aging, status
- [x] **Data Sources**: Connection status with last sync times
- [x] **RBAC**: Only sp-ops, sp-finance, sp-compliance can access
- [x] **Mock Data**: Realistic demo data for all features
- [x] **Responsive UI**: Clean, intuitive interface with Tailwind
- [x] **Idempotency**: All mutations include X-Idempotency-Key
- [x] **Money Handling**: All amounts in paise with proper formatting
- [x] **Time Handling**: IST timezone with proper formatting

---

**Version**: 1.1.0  
**Last Updated**: 2025-09-11  
**Status**: Production Ready + Recent Enhancements

This Ops Dashboard provides a comprehensive, production-grade solution for reconciliation and settlement operations, with powerful features, intuitive UX, and robust security.