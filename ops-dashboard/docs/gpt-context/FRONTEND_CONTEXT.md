# SettlePaisa V2 Ops Dashboard - Frontend Context for GPT

## 🏗️ **Architecture Overview**

### **Tech Stack**
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6 (client-side routing)
- **State Management**: Zustand + TanStack Query
- **Icons**: Lucide React
- **UI Components**: Radix UI + Custom components

### **Project Structure**
```
src/
├── main.tsx                 # App entry point
├── router.tsx              # Route configuration
├── index.css              # Global styles
│
├── pages/                  # Page components
│   ├── Overview.tsx        # Main ops overview page
│   ├── Login.tsx          # Authentication page
│   ├── Unauthorized.tsx   # 403 page
│   ├── ops/               # Operations dashboard pages
│   │   ├── Overview.tsx            # Real-time KPI dashboard
│   │   ├── OverviewV2.tsx         # Alternative overview implementation
│   │   ├── OverviewSimple.tsx     # Simplified overview
│   │   ├── ReconWorkspace.tsx     # Reconciliation workspace
│   │   ├── Exceptions.tsx         # Exception handling
│   │   ├── Connectors.tsx         # Data source connectors
│   │   ├── Reports.tsx           # Report generation
│   │   ├── Analytics.tsx         # Analytics dashboard
│   │   ├── SettlementDetails.tsx # Settlement breakdown
│   │   └── DataSources.tsx       # Data source monitoring
│   └── merchant/          # Merchant portal pages
│       ├── Dashboard.tsx          # Merchant dashboard
│       ├── Settlements.tsx       # Settlement management
│       ├── Reports.tsx           # Merchant reports
│       └── Disputes*.tsx         # Dispute management
│
├── components/            # Reusable components
│   ├── ui/               # Base UI components (Radix-based)
│   │   ├── button.tsx, card.tsx, dialog.tsx, etc.
│   ├── overview/         # Overview-specific components
│   │   ├── Kpis.tsx              # KPI cards with sparklines
│   │   ├── BySource.tsx          # Reconciliation by source
│   │   ├── ConnectorsHealth.tsx  # Connector status monitoring
│   │   ├── SettlementPipeline.tsx # Settlement flow visualization
│   │   └── TopReasons.tsx        # Top exception reasons
│   ├── recon/           # Reconciliation workflow components
│   │   ├── ManualUploadPage.tsx  # File upload interface
│   │   ├── ConnectorsPage.tsx    # Automated connectors
│   │   ├── ReconResults.tsx      # Match results display
│   │   ├── JobsPanel.tsx         # Job queue management
│   │   └── BulkActionsModal.tsx  # Bulk exception resolution
│   ├── exceptions/      # Exception handling components
│   │   ├── ExceptionTable.tsx    # Exception data grid
│   │   ├── ExceptionDrawer.tsx   # Exception detail view
│   │   ├── BulkActionsModal.tsx  # Bulk resolution actions
│   │   └── SavedViewsDropdown.tsx # Saved filter views
│   ├── connectors/      # Data connector components
│   │   ├── ConnectorCard.tsx     # Individual connector status
│   │   ├── ConnectorFormModal.tsx # Connector configuration
│   │   ├── RunHistoryModal.tsx   # Execution history
│   │   └── BackfillModal.tsx     # Historical data backfill
│   ├── merchant/        # Merchant-specific components
│   │   ├── SettlementCalendar.tsx # Settlement scheduling
│   │   ├── CutoffSelector.tsx     # Cutoff time management
│   │   └── WhatIfPreview.tsx      # Settlement preview
│   └── analytics/       # Analytics components
│       ├── SettlementFailureChart.tsx
│       ├── PaymentModeSummary.tsx
│       └── FailureReasonsSummary.tsx
│
├── layouts/             # Layout components
│   ├── OpsLayout.tsx          # Operations dashboard layout
│   └── MerchantLayout.tsx     # Merchant portal layout
│
├── services/           # API services & business logic
│   ├── overview.ts            # Main overview data service
│   ├── reconciliation-engine.ts # Recon matching logic
│   ├── analytics-service.ts   # Analytics data processing
│   ├── chargeback-service.ts  # Chargeback management
│   ├── report-generator*.ts   # Report generation
│   └── connector-scheduler.ts # Connector automation
│
├── hooks/              # Custom React hooks
│   ├── opsOverview.ts         # Overview data hooks
│   ├── useReconJobSummary.ts  # Reconciliation job status
│   ├── useAnalytics*.ts       # Analytics data hooks
│   ├── useSettlementCycle.ts  # Settlement cycle management
│   └── use-toast.ts          # Toast notifications
│
├── lib/                # Utilities & helpers
│   ├── api-client.ts          # HTTP client configuration
│   ├── auth.ts               # Authentication management
│   ├── utils.ts              # Common utilities
│   ├── currency.ts           # Currency formatting
│   ├── linking.ts            # Deep linking utilities
│   └── database.ts           # Local data management
│
├── stores/             # Global state management
│   └── timeFilterStore.ts     # Global time filter state
│
├── types/              # TypeScript type definitions
│   ├── overview.ts            # Overview data types
│   ├── metrics.ts            # KPI & analytics types
│   ├── connector.ts          # Connector configuration types
│   ├── exceptions.ts         # Exception handling types
│   ├── chargebacks.ts        # Chargeback types
│   └── global.d.ts           # Global type declarations
│
└── config/             # Configuration
    └── featureFlags.ts        # Feature toggle configuration
```

## 🔄 **Data Flow Architecture**

### **State Management Strategy**
1. **TanStack Query**: Server state, caching, background sync
2. **Zustand**: Client-side state (time filters, UI state)
3. **React Context**: Authentication, theme
4. **Local Component State**: Form data, UI interactions

### **API Integration Patterns**
```typescript
// Overview data fetching with auto-refresh
const { data: overview, isLoading } = useQuery({
  queryKey: ['overview', timeFilter],
  queryFn: () => fetchOverview(timeFilter),
  refetchInterval: 30000, // 30s auto-refresh
})

// Manual operations with optimistic updates
const mutation = useMutation({
  mutationFn: resolveException,
  onSuccess: () => queryClient.invalidateQueries(['exceptions'])
})
```

## 📱 **Main Application Areas**

### **1. Operations Dashboard (/ops)**
- **Overview** (`/ops/overview`): Real-time KPI monitoring
- **Reconciliation** (`/ops/recon`): File upload, matching, exception resolution  
- **Connectors** (`/ops/connectors`): Automated data ingestion management
- **Exceptions** (`/ops/exceptions`): Exception investigation and resolution
- **Reports** (`/ops/reports`): Automated report generation
- **Analytics** (`/ops/analytics`): Trend analysis and insights
- **Settings** (`/ops/settings`): System configuration

### **2. Merchant Portal (/merchant)**
- **Dashboard** (`/merchant/dashboard`): Merchant overview
- **Settlements** (`/merchant/settlements`): Settlement management
- **Disputes** (`/merchant/disputes`): Chargeback handling
- **Reports** (`/merchant/reports`): Merchant-specific reporting

## 🔐 **Authentication & Authorization**

### **Role-Based Access Control**
```typescript
// Supported roles with access levels
type UserRole = 
  | 'sp-ops'        // Full operations access
  | 'sp-finance'    // Financial operations
  | 'sp-compliance' // Compliance & audit
  | 'merchant-admin' // Merchant portal access

// Route protection
<ProtectedRoute requiredRole="sp-ops">
  <OpsLayout />
</ProtectedRoute>
```

### **Auth Flow**
1. Login page (`/login`) with role selection
2. JWT token storage in localStorage
3. Role-based route access via ProtectedRoute
4. API requests include `X-User-Role` header

## 🎨 **UI/UX Patterns**

### **Design System**
- **Colors**: Tailwind CSS palette with custom SettlePaisa branding
- **Typography**: Inter font family, hierarchical text sizes
- **Spacing**: 4px grid system (Tailwind spacing scale)
- **Components**: Consistent Radix UI primitives

### **Common UI Patterns**
1. **KPI Cards**: Metric + sparkline + trend indicator
2. **Data Tables**: Sortable, filterable, paginated with bulk actions
3. **Modals/Drawers**: Form submissions, detailed views
4. **Toast Notifications**: Success/error feedback
5. **Loading States**: Skeleton screens, spinners
6. **Empty States**: Helpful messaging with CTAs

### **Responsive Design**
- **Mobile-first**: Base styles for mobile, scale up
- **Breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)
- **Grid Layout**: CSS Grid and Flexbox for responsive layouts

## 🔄 **Component Communication Patterns**

### **Parent-Child Communication**
```typescript
// Props down, events up pattern
<ExceptionTable 
  data={exceptions}
  onResolve={(id, reason) => handleResolve(id, reason)}
  onBulkAction={(ids, action) => handleBulkAction(ids, action)}
/>
```

### **Global State Access**
```typescript
// Time filter store (Zustand)
const { filter, setFilter } = useTimeFilterStore()

// Query cache sharing (TanStack Query)
const queryClient = useQueryClient()
queryClient.getQueryData(['overview'])
```

### **Event-Driven Updates**
- **Real-time updates**: 30-second polling for live data
- **Optimistic updates**: Immediate UI feedback before server confirmation
- **Cache invalidation**: Smart query cache updates on mutations

## 📊 **Key Data Entities & Types**

### **Overview Dashboard**
```typescript
type OverviewResponse = {
  kpis: Kpis                    // Match rates, amounts, exceptions
  pipeline: PipelineCounts      // Settlement pipeline stages
  bySource: BySourceItem[]      // Manual vs automated breakdown
  topReasons: TopReason[]       // Exception reasons ranking
  connectorsHealth: ConnectorsHealthItem[] // Data source status
  quality: DataQuality          // Data consistency checks
}
```

### **Reconciliation Workflow**
```typescript
type ReconJob = {
  id: string
  merchant: string
  acquirer: string
  cycle_date: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  files: ReconFile[]
  matches: ReconMatch[]
  exceptions: ReconException[]
}
```

### **Exception Management**
```typescript
type ReconException = {
  id: string
  job_id: string
  type: 'unmatched_pg' | 'unmatched_bank' | 'amount_mismatch'
  pg_txn?: Transaction
  bank_txn?: BankTransaction
  reason_code: string
  status: 'open' | 'investigating' | 'resolved'
  assigned_to?: string
  resolution?: ExceptionResolution
}
```

## 🔧 **Development Patterns**

### **File Naming Conventions**
- **Pages**: PascalCase (e.g., `Overview.tsx`, `SettlementDetails.tsx`)
- **Components**: PascalCase (e.g., `KpiCard.tsx`, `ExceptionTable.tsx`)
- **Hooks**: camelCase starting with 'use' (e.g., `useOpsMetrics.ts`)
- **Services**: camelCase (e.g., `overview.ts`, `reconciliation-engine.ts`)
- **Types**: camelCase (e.g., `overview.ts`, `metrics.ts`)

### **Import Organization**
```typescript
// 1. React & external libraries
import React from 'react'
import { useQuery } from '@tanstack/react-query'

// 2. Internal utilities & types
import { formatCurrency } from '@/lib/currency'
import type { OverviewResponse } from '@/types/overview'

// 3. Internal components
import { KpiCard } from '@/components/KpiCard'
import { SettlementPipeline } from '@/components/overview/SettlementPipeline'
```

### **Error Handling Strategy**
1. **React Error Boundaries**: Page-level error catching
2. **TanStack Query**: Automatic retry, error states
3. **Toast Notifications**: User-friendly error messages
4. **Graceful Degradation**: Fallback UI for failed data loads

## 🚀 **Performance Optimizations**

### **Code Splitting**
- **Route-level**: Lazy loading for all pages
- **Component-level**: Dynamic imports for heavy components
- **Bundle Analysis**: Regular bundle size monitoring

### **Data Optimization**
- **Query Deduplication**: TanStack Query automatic deduplication
- **Background Refetch**: Stale-while-revalidate pattern
- **Optimistic Updates**: Immediate UI response
- **Pagination**: Large datasets loaded incrementally

### **Rendering Optimization**
- **React.memo**: Prevent unnecessary re-renders
- **useCallback/useMemo**: Stable references for expensive computations
- **Virtual Scrolling**: For large data tables
- **Image Optimization**: Lazy loading, proper sizing

## 🧪 **Testing Strategy**

### **Testing Pyramid**
1. **Unit Tests**: Utility functions, custom hooks
2. **Component Tests**: React Testing Library for component behavior
3. **Integration Tests**: API integration, user workflows
4. **E2E Tests**: Critical user journeys (Playwright/Cypress)

### **Testing Utilities**
```typescript
// Custom render with providers
function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions
) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    options
  )
}
```

## 🔄 **Build & Deployment**

### **Vite Configuration**
- **Port**: Always 5174 (configured in vite.config.ts)
- **Proxy**: API routes proxied to backend services
- **History API Fallback**: Client-side routing support
- **Environment Variables**: `VITE_*` prefix for build-time variables

### **Environment Modes**
- **Development**: Mock API mode, hot reloading
- **Production**: Minified, optimized build
- **Preview**: Production build with local server

This frontend context provides GPT with complete understanding of the React application architecture, data flow, component organization, and development patterns used in the SettlePaisa V2 Ops Dashboard.