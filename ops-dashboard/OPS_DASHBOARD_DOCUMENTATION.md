# SettlePaisa Ops Dashboard - Complete Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Features Implemented](#features-implemented)
4. [API Documentation](#api-documentation)
5. [Database Schema](#database-schema)
6. [Reconciliation Workflow](#reconciliation-workflow)
7. [Component Structure](#component-structure)
8. [Configuration & Setup](#configuration--setup)
9. [Business Logic](#business-logic)
10. [Future Enhancements](#future-enhancements)

---

## Project Overview

### Purpose
The SettlePaisa Ops Dashboard is a production-grade reconciliation system designed to handle PA/PG → Bank → Merchant reconciliation workflows. It processes transactions from all merchants universally, automatically detects bank file formats, and provides comprehensive reconciliation capabilities.

### Key Requirements Implemented
- **OP-0002**: Ops Reconciliation Dashboard with RBAC (sp-ops, sp-finance, sp-compliance roles)
- **OP-0003**: Manual Upload + Schema Mapping + End-to-End Reconciliation
- **OP-0006**: Simplified Manual Upload with Inline Results Display

### Core Principles
1. **Money Handling**: All amounts stored in paise (integers only, no floats)
2. **Timezone**: IST (Asia/Kolkata) with 18:00 cutoff
3. **Idempotency**: All mutations use X-Idempotency-Key headers
4. **Universal Processing**: All transactions processed regardless of merchant
5. **Automatic Normalization**: Bank formats auto-detected and normalized

---

## Architecture

### Tech Stack
```
Frontend:
- React 18 + TypeScript
- Vite (build tool)
- TanStack Query (state management)
- Tailwind CSS (styling)
- Lucide React (icons)
- React Router v6 (routing)

Backend (Mock API):
- Mock-first development approach
- LocalStack S3 for file storage
- BigDecimal HALF_EVEN for money calculations

Libraries:
- uuid (idempotency keys)
- date-fns (date handling)
- papaparse (CSV parsing)
- xlsx (Excel parsing)
```

### Project Structure
```
/ops-dashboard/
├── src/
│   ├── components/
│   │   ├── recon/
│   │   │   ├── ManualUploadPage.tsx      # Main upload interface
│   │   │   ├── PreviewKpis.tsx          # KPI display component
│   │   │   ├── PreviewTable.tsx         # Results table with search
│   │   │   ├── RowDrawer.tsx            # Side-by-side diff view
│   │   │   └── UploadCard.tsx           # File upload dropzone
│   │   └── [other components]
│   ├── pages/
│   │   └── ops/
│   │       ├── ReconWorkspaceSimplified.tsx  # Main workspace
│   │       ├── ReconConfigCentral.tsx        # Bank schema management
│   │       └── [other pages]
│   ├── lib/
│   │   ├── ops-api-extended.ts          # Extended API client
│   │   ├── ops-api.ts                   # Base API client
│   │   └── utils.ts                     # Utility functions
│   ├── layouts/
│   │   └── OpsLayout.tsx                # Main layout wrapper
│   └── router.tsx                       # Route configuration
```

---

## Features Implemented

### 1. Authentication & RBAC
```typescript
// Roles supported
type Role = 'sp-ops' | 'sp-finance' | 'sp-compliance'

// Protected routes implementation
<ProtectedRoute allowedRoles={['sp-ops', 'sp-finance', 'sp-compliance']}>
  <OpsLayout />
</ProtectedRoute>
```

### 2. Manual Upload System
- **Dual File Upload**: PG/Transaction file + Bank reconciliation file
- **Drag & Drop**: Interactive dropzones with file validation
- **Auto-Processing**: Reconciliation triggers automatically when both files uploaded
- **Schema Detection**: Automatic detection of bank file format (AXIS, HDFC, ICICI, etc.)

### 3. Reconciliation Engine
- **Universal Matching**: Processes all merchant transactions together
- **Multi-Field Matching**: Matches on Transaction ID, UTR, amounts, dates
- **Status Types**:
  - `matched`: Successfully reconciled
  - `unmatched`: Discrepancies found
  - `awaiting`: Present in PG but not in bank file

### 4. Results Display
- **KPI Chips**: Real-time counts for Matched/Unmatched/Awaiting
- **Reason Analysis**: Breakdown of mismatch reasons
- **Virtualized Table**: Efficient rendering of large datasets
- **Search & Filter**: Quick transaction lookup
- **Side-by-Side Diff**: Detailed comparison view

### 5. Bank Schema Management (Recon Config)
- **Central Configuration**: One place to manage all bank schemas
- **Field Mapping**: Define how bank columns map to standard fields
- **Format Support**: CSV, Excel, JSON
- **Auto-Detection Rules**: Pattern matching for bank identification

---

## API Documentation

### Core API Endpoints

#### 1. File Upload
```typescript
POST /ops/recon/files/s3/upload
Request: FormData with file
Response: {
  fileId: string
  checksum: string
  rowCount: number
  headers: string[]
  preview: any[]
  validations: {
    fileType: boolean
    delimiter: string
    encoding: string
    headerRecognized: boolean
    schemaDetected?: string  // For bank files
  }
  detectedSchema?: string
}
```

#### 2. Create Reconciliation Preview
```typescript
POST /ops/recon/manual/preview
Headers: X-Idempotency-Key
Request: {
  merchantId: string      // 'ALL' for universal
  acquirerCode: string    // 'ALL' for universal
  cycleDate: string
  pgFileId: string
  bankFileId: string
  mappingTemplateId: string  // 'auto' for automatic
  idempotencyKey: string
}
Response: {
  jobId: string
}
```

#### 3. Get Preview Status
```typescript
GET /ops/recon/manual/preview/{jobId}
Response: {
  ready: boolean
  stats?: {
    total: number
    matched: number
    unmatched: number
    awaitingBank: number
    reasons: {
      amountMismatch: number
      dateMismatch: number
      notInBank: number
      notInPG: number
      duplicate: number
      other: number
    }
  }
}
```

#### 4. Get Preview Rows
```typescript
GET /ops/recon/manual/preview/{jobId}/rows
Query: {
  status?: 'all' | 'matched' | 'unmatched' | 'awaiting'
  limit?: number
  cursor?: string
}
Response: {
  data: TransactionRow[]
  cursor?: string
  hasMore: boolean
}
```

#### 5. Export Results
```typescript
GET /ops/recon/manual/preview/{jobId}/export
Query: {
  type: 'matched' | 'unmatched' | 'awaiting'
}
Response: {
  url: string  // Download URL
}
```

### Mock API Implementation

The system uses a mock API for development with realistic data:

```typescript
// ops-api-extended.ts
class OpsApiExtended extends OpsApi {
  async uploadFileToS3(file: File, type: 'pg' | 'bank') {
    // Parse file
    // Auto-detect schema for bank files
    // Return validation and preview data
  }

  async createReconPreview(params) {
    // Generate job ID
    // Trigger async processing
  }

  async getPreviewStatus(jobId: string) {
    // Return reconciliation statistics
    // Always ready in mock mode
  }

  async getPreviewRows(jobId: string, params) {
    // Generate mock reconciliation data
    // Include matched, unmatched, awaiting rows
    // Support pagination with cursor
  }
}
```

---

## Database Schema

### Transaction Row Structure
```typescript
interface TransactionRow {
  // Core identifiers
  id: string
  transactionId: string
  utr: string
  
  // Amounts (in paise)
  grossAmount: number
  netAmount: number
  fee?: number
  tax?: number
  
  // Dates
  paymentDate: string      // ISO 8601
  transactionDate: string  // ISO 8601
  
  // Bank info
  paymentBank: string
  isOnUs: boolean
  
  // Reconciliation status
  status: 'matched' | 'unmatched' | 'awaiting'
  reason?: 'amount_mismatch' | 'date_mismatch' | 'not_in_bank' | 'not_in_pg' | 'duplicate'
  
  // Source data
  pgData?: TransactionData
  bankData?: TransactionData
}
```

### Bank Schema Configuration
```typescript
interface BankSchema {
  id: string
  bankName: string
  bankCode: string
  fileFormat: 'csv' | 'excel' | 'json'
  delimiter?: string
  headerRow: number
  
  fieldMappings: {
    [standardField: string]: {
      sourceColumn: string
      dataType: 'string' | 'amount' | 'date' | 'boolean'
      format?: string      // e.g., 'DD/MM/YYYY', 'paise', 'rupees'
      transform?: string   // Optional transformation logic
    }
  }
  
  sampleHeaders: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

### Standard Fields for Reconciliation
```typescript
const STANDARD_FIELDS = [
  'transaction_id',    // Required
  'utr',              // Required
  'gross_amount',     // Required
  'net_amount',       // Required
  'fee_amount',
  'tax_amount',
  'transaction_date', // Required
  'payment_date',
  'bank_name',
  'is_on_us',
  'rrn',
  'approval_code',
  'merchant_ref',
  'settlement_status',
  'remarks'
]
```

---

## Reconciliation Workflow

### 1. File Upload Phase
```mermaid
User uploads PG file → Parse & validate → Store in S3
User uploads Bank file → Parse & validate → Auto-detect schema → Store in S3
```

### 2. Schema Detection Logic
```typescript
function detectBankSchema(headers: string[]): string {
  // AXIS Bank detection
  if (headers.includes('UTR Number') && headers.includes('Transaction ID')) {
    return 'AXIS'
  }
  
  // HDFC Bank detection
  if (headers.includes('TXN_ID') && headers.includes('UTR_NO')) {
    return 'HDFC'
  }
  
  // ICICI Bank detection
  if (headers.some(h => h.includes('ICICI'))) {
    return 'ICICI'
  }
  
  // Default fallback
  return 'GENERIC'
}
```

### 3. Normalization Process
```typescript
function normalizeTransaction(rawData: any, schema: BankSchema): NormalizedTransaction {
  const normalized: any = {}
  
  for (const [standardField, mapping] of Object.entries(schema.fieldMappings)) {
    const rawValue = rawData[mapping.sourceColumn]
    
    // Apply data type conversion
    switch (mapping.dataType) {
      case 'amount':
        normalized[standardField] = parseAmount(rawValue, mapping.format)
        break
      case 'date':
        normalized[standardField] = parseDate(rawValue, mapping.format)
        break
      case 'boolean':
        normalized[standardField] = parseBoolean(rawValue)
        break
      default:
        normalized[standardField] = rawValue
    }
  }
  
  return normalized
}
```

### 4. Matching Algorithm
```typescript
function matchTransactions(pgTransactions: Transaction[], bankTransactions: Transaction[]) {
  const results = []
  
  // Create indexes for efficient lookup
  const bankByUtr = indexBy(bankTransactions, 'utr')
  const bankByTxnId = indexBy(bankTransactions, 'transactionId')
  
  for (const pgTxn of pgTransactions) {
    // Try exact match on UTR
    let bankTxn = bankByUtr[pgTxn.utr]
    
    // Fallback to transaction ID
    if (!bankTxn) {
      bankTxn = bankByTxnId[pgTxn.transactionId]
    }
    
    if (bankTxn) {
      // Check for discrepancies
      const status = validateMatch(pgTxn, bankTxn)
      results.push({
        ...pgTxn,
        status,
        bankData: bankTxn,
        pgData: pgTxn
      })
    } else {
      // Not found in bank
      results.push({
        ...pgTxn,
        status: 'awaiting',
        reason: 'not_in_bank',
        pgData: pgTxn
      })
    }
  }
  
  return results
}
```

### 5. Validation Rules
```typescript
function validateMatch(pgTxn: Transaction, bankTxn: Transaction): MatchStatus {
  const issues = []
  
  // Amount validation (tolerance: 100 paise)
  if (Math.abs(pgTxn.grossAmount - bankTxn.grossAmount) > 100) {
    issues.push('amount_mismatch')
  }
  
  // Date validation (same day)
  if (!isSameDay(pgTxn.paymentDate, bankTxn.paymentDate)) {
    issues.push('date_mismatch')
  }
  
  if (issues.length > 0) {
    return {
      status: 'unmatched',
      reason: issues[0]
    }
  }
  
  return { status: 'matched' }
}
```

---

## Component Structure

### 1. ManualUploadPage Component
```typescript
// Main orchestrator for manual upload workflow
function ManualUploadPage() {
  const [session, setSession] = useState<PreviewSession>({
    jobId: '',
    merchantId: 'ALL',
    acquirerCode: 'ALL',
    cycleDate: new Date().toISOString().split('T')[0],
    mappingTemplateId: 'auto',
    status: 'idle'
  })
  
  // Handles:
  // - File uploads (PG and Bank)
  // - Auto-trigger reconciliation
  // - Display results inline
  // - Export functionality
}
```

### 2. PreviewKpis Component
```typescript
interface PreviewKpisProps {
  stats: {
    total: number
    matched: number
    unmatched: number
    awaitingBank: number
    reasons: ReasonBreakdown
  }
  onRerun: () => void
  onExport: (type: ExportType) => void
}

// Displays:
// - KPI chips with counts and percentages
// - Reason breakdown chips
// - Export buttons for each category
// - Re-run reconciliation button
```

### 3. PreviewTable Component
```typescript
interface PreviewTableProps {
  rows: TransactionRow[]
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  onRowClick: (row: TransactionRow) => void
}

// Features:
// - Virtualized rendering for performance
// - Search by Transaction ID/UTR
// - Infinite scroll with cursor pagination
// - Status badges and reason chips
// - Click to open detailed view
```

### 4. RowDrawer Component
```typescript
interface RowDrawerProps {
  row: TransactionRow
  isOpen: boolean
  onClose: () => void
  onCreateException?: () => void
  onManualMatch?: () => void
}

// Shows:
// - Side-by-side comparison (PG vs Bank)
// - Highlighted differences with badges
// - Raw data view (collapsible)
// - Action buttons for exceptions/manual match
```

### 5. ReconConfigCentral Component
```typescript
// Central bank schema management
function ReconConfigCentral() {
  // Features:
  // - List all configured bank schemas
  // - Add/Edit/Delete schemas
  // - Define field mappings
  // - Test schema with sample data
  // - Active/Inactive status management
}
```

---

## Configuration & Setup

### Environment Variables
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCK_API=true

# AWS S3 Configuration
VITE_S3_BUCKET=settlepaisa-recon-files
VITE_S3_REGION=us-east-1

# Feature Flags
VITE_ENABLE_EXPORT=true
VITE_ENABLE_MANUAL_MATCH=true
```

### Package.json
```json
{
  "name": "settlepaisa-ops-dashboard",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.0.0",
    "lucide-react": "^0.300.0",
    "date-fns": "^3.0.0",
    "uuid": "^9.0.0",
    "papaparse": "^5.4.0",
    "xlsx": "^0.18.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

### Tailwind Configuration
```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'settlepaisa': {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
```

---

## Business Logic

### 1. Money Handling
```typescript
// All amounts in paise (smallest unit)
const formatPaiseToINR = (paise: number): string => {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees)
}

// Parse amounts with validation
const parseAmount = (value: string, format: 'paise' | 'rupees'): number => {
  const num = parseFloat(value.replace(/[^0-9.-]/g, ''))
  if (isNaN(num)) return 0
  
  return format === 'rupees' ? Math.round(num * 100) : Math.round(num)
}
```

### 2. Date Handling
```typescript
// IST timezone with 18:00 cutoff
const getSettlementDate = (transactionDate: Date): Date => {
  const istDate = new Date(transactionDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const hours = istDate.getHours()
  
  // After 6 PM, settlement is next day
  if (hours >= 18) {
    istDate.setDate(istDate.getDate() + 1)
  }
  
  istDate.setHours(0, 0, 0, 0)
  return istDate
}
```

### 3. Idempotency
```typescript
// Generate and track idempotency keys
const createIdempotentRequest = async (fn: Function, key?: string) => {
  const idempotencyKey = key || uuidv4()
  
  try {
    const result = await fn({
      headers: {
        'X-Idempotency-Key': idempotencyKey
      }
    })
    return result
  } catch (error) {
    // Check if duplicate request
    if (error.code === 'DUPLICATE_REQUEST') {
      return error.originalResponse
    }
    throw error
  }
}
```

### 4. File Validation
```typescript
const validateFile = (file: File, type: 'pg' | 'bank'): ValidationResult => {
  const validations = {
    size: file.size <= 50 * 1024 * 1024, // 50MB limit
    type: ['text/csv', 'application/vnd.ms-excel', 'application/json'].includes(file.type),
    name: /\.(csv|xlsx|json)$/i.test(file.name)
  }
  
  return {
    isValid: Object.values(validations).every(v => v),
    errors: Object.entries(validations)
      .filter(([_, valid]) => !valid)
      .map(([key]) => `Invalid ${key}`)
  }
}
```

### 5. Reconciliation Stats
```typescript
const calculateStats = (rows: TransactionRow[]): ReconciliationStats => {
  const stats = {
    total: rows.length,
    matched: 0,
    unmatched: 0,
    awaitingBank: 0,
    reasons: {
      amountMismatch: 0,
      dateMismatch: 0,
      notInBank: 0,
      notInPG: 0,
      duplicate: 0,
      other: 0
    }
  }
  
  rows.forEach(row => {
    stats[row.status]++
    if (row.reason) {
      stats.reasons[row.reason]++
    }
  })
  
  return stats
}
```

---

## Future Enhancements

### Phase 1 - Q1 2025
1. **Real-time Processing**
   - WebSocket support for live updates
   - Progress indicators for large files
   - Streaming reconciliation results

2. **Advanced Matching**
   - Fuzzy matching algorithms
   - ML-based pattern recognition
   - Configurable matching rules

3. **Bulk Operations**
   - Batch file uploads
   - Scheduled reconciliation jobs
   - Auto-download from bank APIs

### Phase 2 - Q2 2025
1. **Analytics Dashboard**
   - Trend analysis
   - Success rate metrics
   - Exception patterns

2. **Workflow Automation**
   - Rule-based auto-resolution
   - Exception escalation
   - Email/Slack notifications

3. **API Integrations**
   - Direct bank API connections
   - Payment gateway webhooks
   - ERP system sync

### Phase 3 - Q3 2025
1. **Machine Learning**
   - Predictive exception detection
   - Smart schema mapping
   - Anomaly detection

2. **Compliance Features**
   - Audit trail
   - Regulatory reporting
   - Data retention policies

3. **Performance Optimization**
   - Database indexing
   - Caching strategies
   - CDN implementation

---

## Testing Strategy

### Unit Tests
```typescript
// Example test for amount parsing
describe('parseAmount', () => {
  it('should parse rupees correctly', () => {
    expect(parseAmount('1,234.56', 'rupees')).toBe(123456)
  })
  
  it('should parse paise correctly', () => {
    expect(parseAmount('123456', 'paise')).toBe(123456)
  })
  
  it('should handle invalid input', () => {
    expect(parseAmount('invalid', 'rupees')).toBe(0)
  })
})
```

### Integration Tests
```typescript
// Test file upload and processing
describe('Reconciliation Workflow', () => {
  it('should process files and return results', async () => {
    const pgFile = new File(['...'], 'pg.csv')
    const bankFile = new File(['...'], 'bank.csv')
    
    const pgResult = await api.uploadFileToS3(pgFile, 'pg')
    const bankResult = await api.uploadFileToS3(bankFile, 'bank')
    
    const preview = await api.createReconPreview({
      pgFileId: pgResult.fileId,
      bankFileId: bankResult.fileId,
      // ...
    })
    
    expect(preview.jobId).toBeDefined()
    
    const status = await api.getPreviewStatus(preview.jobId)
    expect(status.ready).toBe(true)
    expect(status.stats.total).toBeGreaterThan(0)
  })
})
```

---

## Troubleshooting Guide

### Common Issues

1. **Files not uploading**
   - Check file size (max 50MB)
   - Verify file format (CSV/Excel/JSON)
   - Ensure headers are in first row

2. **Schema not detected**
   - Check bank file headers match configured patterns
   - Verify schema is active in Recon Config
   - Review console logs for detection logic

3. **Reconciliation not starting**
   - Ensure both files are uploaded
   - Check browser console for errors
   - Verify API endpoints are accessible

4. **Mismatched transactions**
   - Review matching rules
   - Check date formats
   - Verify amount units (paise vs rupees)

---

## Security Considerations

1. **File Upload Security**
   - Virus scanning on upload
   - File type validation
   - Size limits enforced
   - Sandboxed processing

2. **Data Protection**
   - Encryption at rest (S3)
   - Encryption in transit (HTTPS)
   - PII data masking
   - Audit logging

3. **Access Control**
   - Role-based permissions
   - Session management
   - API rate limiting
   - CORS configuration

---

## Performance Metrics

### Target Metrics
- File upload: < 2 seconds for 10MB file
- Reconciliation: < 5 seconds for 10,000 transactions
- UI response: < 100ms for user interactions
- Search: < 500ms for 100,000 records

### Optimization Techniques
1. **Frontend**
   - Virtual scrolling for large datasets
   - Lazy loading of components
   - Debounced search
   - Memoized calculations

2. **Backend**
   - Indexed database queries
   - Parallel processing
   - Caching strategies
   - Connection pooling

---

## Support & Maintenance

### Monitoring
- Application logs via CloudWatch
- Error tracking with Sentry
- Performance monitoring with DataDog
- Uptime monitoring with Pingdom

### Backup & Recovery
- Daily database backups
- S3 versioning enabled
- Point-in-time recovery
- Disaster recovery plan

### Documentation
- API documentation (OpenAPI/Swagger)
- User guides
- Video tutorials
- Release notes

---

## Conclusion

The SettlePaisa Ops Dashboard provides a comprehensive, production-ready reconciliation system with automatic schema detection, universal transaction processing, and intuitive user experience. The architecture supports scalability, maintainability, and future enhancements while maintaining high performance and security standards.

---

## Appendix

### A. Sample Data Formats

#### PG Transaction File (CSV)
```csv
Transaction ID,UTR,Gross Amount,Net Amount,Fee,Tax,Payment Date,Transaction Date,Bank,Status
TXN20240114001,AXISN024011410001,10000000,9900000,100000,18000,2024-01-14T18:00:00Z,2024-01-14T10:00:00Z,AXIS,SUCCESS
```

#### Bank Reconciliation File (CSV)
```csv
TXN_ID,UTR_NO,AMOUNT,NET_AMOUNT,FEE,TAX,PAYMENT_DT,TXN_DT,BANK_NAME,STATUS
TXN20240114001,AXISN024011410001,10000000,9900000,100000,18000,14/01/2024,14/01/2024,AXIS,SETTLED
```

### B. Error Codes
```typescript
enum ErrorCode {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  SCHEMA_NOT_FOUND = 'SCHEMA_NOT_FOUND',
  RECONCILIATION_FAILED = 'RECONCILIATION_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED'
}
```

### C. Glossary
- **UTR**: Unique Transaction Reference
- **RRN**: Retrieval Reference Number
- **On-Us**: Transaction where payer and payee banks are same
- **T+1**: Settlement on next business day
- **IST**: Indian Standard Time (UTC+5:30)

---

*Document Version: 1.0*  
*Last Updated: 2025-09-10*  
*Maintained By: SettlePaisa Engineering Team*