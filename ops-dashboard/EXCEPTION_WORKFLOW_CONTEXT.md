# Exception Workflow System - Context Document

## Overview
Enterprise-grade exception management system for reconciliation workflows with SLA tracking, severity-based routing, and comprehensive audit trails.

## Architecture

### Database Tables

#### 1. `sp_v2_exception_workflow`
Main exception tracking table with complete denormalized data for performance.

**Key Columns:**
- `id` - Primary key (bigint, auto-increment)
- `exception_id` - Unique exception code (e.g., EXC-20250102-001)
- `merchant_id`, `merchant_name`, `acquirer_code` - Merchant info
- `reason` - Exception reason code (AMOUNT_MISMATCH, UTR_NOT_FOUND, etc.)
- `status` - Workflow status (open, investigating, resolved, escalated, snoozed)
- `severity` - Priority level (critical, high, medium, low)
- `sla_due_at` - SLA deadline timestamp
- `amount_delta` - Amount discrepancy in paise
- `pg_transaction_id`, `bank_utr`, `cycle_date` - Transaction identifiers

#### 2. `sp_v2_transactions`
Source table that triggers exception workflow creation.

**Key Fields:**
- `exception_reason` - Reason code that triggers workflow
- `status` - When set to 'EXCEPTION', triggers workflow creation

**Data Flow:**
```
sp_v2_transactions (INSERT/UPDATE with status='EXCEPTION')
    ↓ (trigger: trg_create_exception_workflow)
sp_v2_exception_workflow (automatically populated)
    ↓ (API query)
Frontend UI (Exception Management)
```

### Exception Reason Types
1. **AMOUNT_MISMATCH** - PG amount ≠ Bank amount
2. **UTR_NOT_FOUND** - UTR missing in bank statement
3. **DUPLICATE_UTR** - Same UTR appears multiple times
4. **MISSING_UTR** - UTR field is null/empty
5. **NO_PG_TXN** - Bank entry has no matching PG transaction

### SLA Rules
- **Critical**: 4 hours
- **High**: 8 hours
- **Medium**: 24 hours
- **Low**: 48 hours

## Frontend Components

### 1. Exception Page (`/ops/exceptions`)
**File:** `/Users/shantanusingh/ops-dashboard/src/pages/ops/Exceptions.tsx`

**Key Features:**
- Infinite scroll with data accumulation (not replacement)
- Real-time updates every 30 seconds
- Saved views and filters
- Bulk actions support
- Export functionality

**Important Implementation Details:**
```typescript
// Data accumulation for infinite scroll
const [allExceptions, setAllExceptions] = useState<Exception[]>([])

useEffect(() => {
  if (exceptionsData?.items) {
    if (!cursor) {
      setAllExceptions(exceptionsData.items)  // First page
    } else {
      setAllExceptions(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newItems = exceptionsData.items.filter(e => !existingIds.has(e.id))
        return [...prev, ...newItems]  // Append subsequent pages
      })
    }
  }
}, [exceptionsData, cursor])
```

### 2. Exception Table Component
**File:** `/Users/shantanusingh/ops-dashboard/src/components/exceptions/ExceptionTable.tsx`

**Key Features:**
- Checkbox selection with indeterminate state (using ref)
- Scroll-triggered pagination
- SLA status calculation with color coding
- Fallback display for null values

**Columns:**
1. Checkbox (bulk select)
2. Exception ID + PG Transaction ID
3. Reason (formatted, underscores removed)
4. Amount Delta (red=loss, green=gain)
5. Merchant (name or ID fallback) + Acquirer
6. Cycle Date (formatted)
7. Age (relative time)
8. SLA (hours left / breached)
9. Severity (badge)
10. Assigned To + Tags
11. Status (icon + text)
12. Updated (relative time)
13. Actions (chevron to open drawer)

**Important Fixes:**
```typescript
// Fixed indeterminate checkbox warning
const selectAllRef = useRef<HTMLInputElement>(null)
useEffect(() => {
  if (selectAllRef.current) {
    const isIndeterminate = selectedIds.length > 0 && selectedIds.length < exceptions.length
    selectAllRef.current.indeterminate = isIndeterminate
  }
}, [selectedIds, exceptions])

// Merchant name fallback
<div className="text-sm text-gray-900">
  {exception.merchantName || exception.merchantId || '-'}
</div>

// Cycle date formatting
{exception.cycleDate ? new Date(exception.cycleDate).toLocaleDateString() : '-'}
```

### 3. Exception Drawer
**File:** `/Users/shantanusingh/ops-dashboard/src/components/exceptions/ExceptionDrawer.tsx`

**Features:**
- Full exception details
- Status updates with notes
- Assignment management
- Severity changes
- Activity timeline
- Related transactions

## Backend APIs

### Exception API Routes
**File:** `/Users/shantanusingh/ops-dashboard/services/recon-api/routes/exceptions-v2.js`

**Endpoints:**
1. `GET /api/exceptions` - List exceptions with filters, pagination
2. `GET /api/exceptions/:id` - Get single exception details
3. `PUT /api/exceptions/:id` - Update exception status/severity
4. `POST /api/exceptions/bulk-update` - Bulk operations
5. `POST /api/exceptions/export` - Export to CSV/Excel

**Query Features:**
- Filter by: status, severity, reason, merchant, date range
- Search by: exception_id, pg_transaction_id, bank_utr
- Cursor-based pagination (limit: 50 per page)
- Sort by: created_at, sla_due_at, amount_delta

## Data Consistency

### Test Data
Created diverse exception test data (9 records):
- 3x UTR_NOT_FOUND
- 2x DUPLICATE_UTR  
- 2x MISSING_UTR
- 2x NO_PG_TXN

### Database Updates
Populated missing merchant data for 145 exceptions:
```sql
UPDATE sp_v2_exception_workflow SET 
  merchant_name = CASE 
    WHEN merchant_id = 'MERCH001' THEN 'Acme Corp' 
    WHEN merchant_id = 'MERCH002' THEN 'Beta Ltd' 
    WHEN merchant_id = 'MERCH003' THEN 'Gamma Inc' 
    ELSE merchant_id 
  END,
  acquirer_code = CASE 
    WHEN merchant_id IN ('MERCH001', 'MERCH002') THEN 'HDFC' 
    WHEN merchant_id = 'MERCH003' THEN 'ICICI' 
    ELSE 'AXIS' 
  END 
WHERE merchant_name IS NULL OR acquirer_code IS NULL
```

## Recent Fixes (v2.4.1)

### Issue 1: Scroll Position Lost
**Problem:** Users couldn't scroll back up after scrolling down
**Root Cause:** Pagination was replacing data instead of accumulating
**Fix:** Implemented data accumulation with `allExceptions` state

### Issue 2: React Warning - Indeterminate Checkbox
**Problem:** `Warning: Received 'false' for a non-boolean attribute 'indeterminate'`
**Fix:** Changed from prop to ref-based implementation

### Issue 3: Missing Column Data
**Problem:** Merchant and cycle date columns showing blank/null
**Fix:** 
- Added fallback logic (merchantName || merchantId || '-')
- Populated database with merchant names
- Fixed date formatting

## Git History
- Commit `dc0606b` - Fix exception table scroll and data display issues
- Branch: `main`

## Key Learnings

1. **Infinite Scroll Pattern**: Always accumulate data, never replace on pagination
2. **React Refs for DOM Properties**: Use refs for properties like `indeterminate` that aren't standard props
3. **Database Denormalization**: sp_v2_exception_workflow denormalizes for performance
4. **Fallback Display Logic**: Always handle null values with fallbacks in UI
5. **Cursor-Based Pagination**: More efficient than offset for large datasets

## Future Enhancements
- Auto-assignment based on rules
- ML-based severity prediction
- Exception pattern detection
- Integration with notification systems
- Advanced analytics dashboard
