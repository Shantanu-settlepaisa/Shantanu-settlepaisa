# SettlePaisa V1 Frontend Context Document

**Version:** 1.0  
**Date:** September 30, 2024  
**Purpose:** Complete frontend context for SettlePaisa V1 system and integration patterns with V2 Ops Dashboard  

## Executive Summary

This document provides comprehensive frontend context for SettlePaisa V1, including UI components, user flows, and integration patterns that inform the development of the SettlePaisa 2.0 Ops Dashboard.

## Frontend Architecture Overview

### Technology Stack (V1)
- **Framework**: React.js 16.x
- **State Management**: Redux + Redux Toolkit
- **Routing**: React Router v5
- **UI Components**: Ant Design 4.x
- **Charts**: Chart.js / D3.js
- **HTTP Client**: Axios
- **Build Tool**: Create React App (CRA)
- **Styling**: CSS Modules + Ant Design theming

### Project Structure (V1)
```
src/
├── components/           # Reusable UI components
│   ├── common/          # Shared components
│   ├── charts/          # Chart components
│   ├── forms/           # Form components
│   └── tables/          # Data table components
├── pages/               # Route-level components
│   ├── auth/           # Authentication pages
│   ├── dashboard/      # Dashboard pages
│   ├── merchants/      # Merchant management
│   ├── settlements/    # Settlement pages
│   ├── reconciliation/ # Recon pages
│   └── reports/        # Reporting pages
├── services/           # API service layer
├── store/              # Redux store configuration
├── utils/              # Utility functions
└── styles/             # Global styles
```

## Core Frontend Modules

### 1. Authentication Module

**Components:**
- `LoginForm` - JWT-based authentication
- `SignupForm` - User registration
- `ForgotPasswordForm` - Password reset
- `UserProfile` - Profile management

**User Flows:**
```
Login Flow:
1. User enters credentials
2. POST /auth/login
3. Store JWT token in localStorage
4. Redirect to dashboard
5. Auto-refresh token on expiry

Role Management Flow:
1. Admin creates roles with permissions
2. Assign users to roles
3. Frontend enforces permission-based UI rendering
4. API validates permissions on each request
```

**Key Features:**
- JWT token management with auto-refresh
- Role-based UI component visibility
- Session timeout handling
- Multi-factor authentication support

### 2. Dashboard Module

**Components:**
- `DashboardOverview` - Main KPI tiles
- `TransactionSummary` - Transaction metrics
- `SettlementStatus` - Settlement pipeline
- `ReconSummary` - Reconciliation status
- `AlertsPanel` - System notifications

**Key Metrics Displayed:**
- Total transaction volume (₹ in Crores)
- Transaction count by status
- Settlement success rate
- Reconciliation match rate
- Outstanding settlements
- Average settlement time
- Commission earned
- TDS collected

**Data Refresh:**
- Real-time: Every 30 seconds for critical metrics
- Batch: Every 5 minutes for reports
- Manual refresh button available

### 3. Merchant Management Module

**Components:**
- `MerchantList` - Paginated merchant grid
- `MerchantForm` - Add/Edit merchant
- `MerchantDetails` - Complete merchant view
- `KYCStatus` - KYC verification tracking
- `BankDetails` - Bank account management

**Merchant Data Fields:**
```json
{
  "basicInfo": {
    "name": "string",
    "businessType": "string",
    "gstin": "string",
    "pan": "string",
    "registrationDate": "date"
  },
  "bankDetails": {
    "accountNumber": "string",
    "ifscCode": "string",
    "bankName": "string",
    "accountType": "CURRENT|SAVINGS"
  },
  "riskManagement": {
    "riskScore": "number (0-100)",
    "kycStatus": "PENDING|VERIFIED|REJECTED",
    "rollingReserveRate": "number (%)"
  },
  "commissionTiers": {
    "currentTier": "string",
    "commissionRate": "number (%)",
    "volumeThreshold": "number"
  }
}
```

**User Flows:**
- Merchant onboarding wizard (4 steps)
- KYC document upload and verification
- Bank account verification (penny drop)
- Commission tier assignment
- Risk score calculation

### 4. Settlement Module

**Components:**
- `SettlementCycles` - Settlement calendar view
- `SettlementBatches` - Batch processing status
- `SettlementCalculator` - Preview calculations
- `PayoutStatus` - Bank transfer tracking
- `SettlementReports` - Downloadable reports

**Settlement Pipeline Visualization:**
```
[Captured] → [In Settlement] → [Sent to Bank] → [Credited] → [Completed]
     ↓              ↓               ↓            ↓            ↓
   25,847         18,234          15,678      12,345       12,245
```

**Settlement Calculation UI:**
- Gross amount calculator
- Commission breakdown (tier-based)
- GST calculation (18% on commission)
- TDS deduction (1-2% of gross)
- Rolling reserve hold (3-18%)
- Net settlement amount

### 5. Reconciliation Module

**Components:**
- `ReconDashboard` - Match rate overview
- `UnmatchedTransactions` - Exception handling
- `BankFileUpload` - Bank statement processing
- `ManualMatching` - Manual recon interface
- `ReconRules` - Automated matching rules

**Reconciliation Workflow:**
```
1. Bank File Upload
   ├── File validation (format, checksum)
   ├── Data parsing (CSV/Excel/Fixed-width)
   └── Record count verification

2. Automatic Matching
   ├── Exact UTR matching
   ├── Amount + date matching
   ├── Fuzzy matching (80%+ confidence)
   └── Rule-based matching

3. Exception Handling
   ├── Unmatched PG transactions
   ├── Unmatched bank credits
   ├── Amount mismatches
   └── Duplicate transactions

4. Manual Review
   ├── Exception queue management
   ├── Manual matching interface
   ├── Approval workflow
   └── Audit trail
```

**Reconciliation Metrics:**
- Match rate percentage (target: 98%+)
- Unmatched transaction count
- Amount variance (₹)
- Processing time
- Exception resolution time

### 6. Reports Module

**Components:**
- `ReportBuilder` - Custom report generator
- `ReportScheduler` - Automated reports
- `ReportHistory` - Generated reports list
- `DataExport` - Export functionality
- `ReportTemplates` - Pre-built reports

**Standard Reports:**
- **Financial Reports**
  - Settlement summary (daily/monthly)
  - Commission earnings
  - Tax reports (TDS/GST)
  - Rolling reserve status

- **Operational Reports**
  - Transaction analysis
  - Success rate trends
  - Payment mode distribution
  - Merchant performance

- **Compliance Reports**
  - KYC status summary
  - Risk assessment
  - Audit trails
  - Regulatory submissions

**Export Formats:**
- Excel (.xlsx)
- CSV (.csv)
- PDF (formatted reports)
- JSON (API data)

## UI/UX Design Patterns

### Design System (V1)
- **Color Palette**: Blue (#1890ff) primary, Grey (#f0f0f0) secondary
- **Typography**: -apple-system, BlinkMacSystemFont, Segoe UI
- **Spacing**: 8px grid system
- **Components**: Ant Design component library
- **Icons**: Ant Design icons + custom SVGs

### Responsive Design
- **Desktop**: 1200px+ (primary target)
- **Tablet**: 768px-1199px (limited functionality)
- **Mobile**: 320px-767px (view-only mode)

### Navigation Structure
```
├── Dashboard
├── Merchants
│   ├── List
│   ├── Add New
│   └── Bulk Upload
├── Settlements
│   ├── Cycles
│   ├── Batches
│   └── Calculator
├── Reconciliation
│   ├── Dashboard
│   ├── Upload Bank Files
│   ├── Exceptions
│   └── Rules
├── Reports
│   ├── Generate
│   ├── Schedule
│   └── History
├── Master Data
│   ├── Service Types
│   ├── Commission Tiers
│   └── Bank Configuration
└── Settings
    ├── Users & Roles
    ├── Notifications
    └── System Config
```

## State Management (Redux)

### Store Structure
```javascript
{
  auth: {
    user: UserObject,
    token: string,
    permissions: Array<string>,
    isAuthenticated: boolean
  },
  merchants: {
    list: Array<Merchant>,
    selected: Merchant,
    loading: boolean,
    filters: FilterObject
  },
  settlements: {
    cycles: Array<SettlementCycle>,
    batches: Array<SettlementBatch>,
    calculations: CalculationObject
  },
  reconciliation: {
    summary: ReconSummary,
    exceptions: Array<Exception>,
    rules: Array<ReconRule>
  },
  reports: {
    templates: Array<ReportTemplate>,
    generated: Array<GeneratedReport>,
    scheduled: Array<ScheduledReport>
  },
  ui: {
    loading: boolean,
    notifications: Array<Notification>,
    modal: ModalState
  }
}
```

### Action Patterns
```javascript
// Async action pattern
const fetchMerchants = createAsyncThunk(
  'merchants/fetchMerchants',
  async (filters, { rejectWithValue }) => {
    try {
      const response = await merchantAPI.getList(filters);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);
```

## API Integration Patterns

### Service Layer Architecture
```javascript
// Base API client with interceptors
class APIClient {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_BASE_URL,
      timeout: 30000
    });
    
    this.setupInterceptors();
  }
  
  setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      }
    );
    
    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Redirect to login
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }
}

// Specific service implementations
class MerchantService extends APIClient {
  async getList(filters = {}) {
    return this.client.get('/master_data/get_merchant_data', { params: filters });
  }
  
  async getById(id) {
    return this.client.get(`/master_data/get_merchant_data_byID?id=${id}`);
  }
  
  async create(merchantData) {
    return this.client.post('/master_data/upload_merchant_data_csv', merchantData);
  }
}
```

### Error Handling Strategy
```javascript
// Global error handler
const errorHandler = {
  handleAPIError: (error, dispatch) => {
    const message = error.response?.data?.message || error.message;
    
    dispatch(showNotification({
      type: 'error',
      message,
      duration: 5000
    }));
    
    // Log to monitoring service
    console.error('API Error:', error);
  },
  
  handleValidationError: (errors, setFieldError) => {
    errors.forEach(error => {
      setFieldError(error.field, error.message);
    });
  }
};
```

## Performance Optimization

### Code Splitting
```javascript
// Route-based code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Merchants = lazy(() => import('./pages/Merchants'));
const Settlements = lazy(() => import('./pages/Settlements'));

// Component-based splitting for heavy components
const ReportsModule = lazy(() => import('./modules/Reports'));
```

### Data Fetching Optimization
- **Pagination**: Server-side pagination for large datasets
- **Caching**: React Query for intelligent caching
- **Debouncing**: Search input debouncing (300ms)
- **Virtual Scrolling**: For large transaction lists
- **Lazy Loading**: Images and non-critical components

### Bundle Optimization
- **Tree Shaking**: Remove unused Ant Design components
- **Compression**: Gzip/Brotli compression
- **CDN**: Static assets served from CDN
- **Chunking**: Vendor/app/common chunks

## Security Implementation

### Frontend Security Measures
```javascript
// XSS Protection
const sanitizeInput = (input) => {
  return DOMPurify.sanitize(input);
};

// CSRF Protection
axios.defaults.xsrfCookieName = 'XSRF-TOKEN';
axios.defaults.xsrfHeaderName = 'X-XSRF-TOKEN';

// Content Security Policy
const CSP_POLICY = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: https:",
  'connect-src': "'self' https://settlepaisaapi.sabpaisa.in"
};
```

### Data Protection
- Sensitive data masked in UI (account numbers, PAN)
- Local storage encryption for tokens
- Session timeout enforcement
- Input validation and sanitization

## Integration with V2 Ops Dashboard

### Migration Strategy
1. **Component Reusability**: Extract reusable components from V1
2. **API Compatibility**: Maintain V1 API endpoints during transition
3. **State Migration**: Gradually migrate Redux to modern state management
4. **UI Consistency**: Align V2 design system with V1 patterns

### Shared Components (V1 → V2)
```javascript
// Reusable components for V2
export const components = {
  // Data display
  TransactionTable: './components/tables/TransactionTable',
  SettlementCard: './components/cards/SettlementCard',
  ReconStatusBadge: './components/badges/ReconStatusBadge',
  
  // Forms
  MerchantForm: './components/forms/MerchantForm',
  SettlementCalculator: './components/forms/SettlementCalculator',
  
  // Charts
  RevenueChart: './components/charts/RevenueChart',
  SuccessRateChart: './components/charts/SuccessRateChart',
  
  // Utilities
  DateRangePicker: './components/common/DateRangePicker',
  ExportButton: './components/common/ExportButton'
};
```

### Data Flow Compatibility
```javascript
// V1 data format transformation for V2 compatibility
const transformV1DataForV2 = {
  merchant: (v1Merchant) => ({
    id: v1Merchant.merchant_id,
    name: v1Merchant.name,
    status: v1Merchant.kyc_status,
    riskScore: v1Merchant.risk_score,
    // ... other mappings
  }),
  
  settlement: (v1Settlement) => ({
    id: v1Settlement.settlement_id,
    merchantId: v1Settlement.merchant_id,
    grossAmount: v1Settlement.gross_amount,
    netAmount: v1Settlement.net_amount,
    // ... other mappings
  })
};
```

## Testing Strategy

### Test Coverage (V1)
- **Unit Tests**: Jest + React Testing Library (80% coverage)
- **Integration Tests**: API service testing
- **E2E Tests**: Cypress for critical user flows
- **Visual Tests**: Storybook + Chromatic

### Critical Test Scenarios
1. **Authentication Flow**
   - Login/logout functionality
   - Token refresh mechanism
   - Permission-based access

2. **Settlement Processing**
   - Calculation accuracy
   - Batch creation workflow
   - Error handling

3. **Reconciliation**
   - File upload validation
   - Matching algorithm accuracy
   - Exception handling

## Deployment & DevOps

### Build Pipeline
```yaml
# CI/CD Pipeline (V1)
stages:
  - install
  - test
  - build
  - deploy

install:
  script: npm ci

test:
  script: 
    - npm run test:unit
    - npm run test:e2e

build:
  script:
    - npm run build
    - npm run analyze-bundle

deploy:
  script:
    - docker build -t settlepaisa-v1-frontend .
    - kubectl apply -f k8s/deployment.yaml
```

### Environment Configuration
- **Development**: Hot reloading, debug tools
- **Staging**: Production build, test data
- **Production**: Optimized build, monitoring

This comprehensive frontend context document provides the foundation for understanding SettlePaisa V1's user interface patterns, component architecture, and integration approaches that inform the development of the V2 Ops Dashboard.