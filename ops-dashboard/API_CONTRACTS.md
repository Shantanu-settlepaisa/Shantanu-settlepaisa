# SettlePaisa API Contracts

> **Purpose**: Complete specification of all API endpoints, request/response structures, and validation rules
> **Last Updated**: 2025-10-10
> **Base URL**: `http://localhost:5108` (development), `https://api.settlepaisa.com` (production)

---

## Table of Contents

1. [Overview API](#1-overview-api)
2. [Operations Overview API](#2-operations-overview-api)
3. [KPIs API](#3-kpis-api)
4. [Pipeline API](#4-pipeline-api)
5. [Exceptions API](#5-exceptions-api)
6. [Reconciliation Sources API](#6-reconciliation-sources-api)
7. [Analytics API](#7-analytics-api)
8. [Disputes API](#8-disputes-api)

---

## 1. OVERVIEW API

### GET `/api/overview`

**Purpose**: Fetch simplified overview data (pipeline only, no reconciliation details)
**Use Case**: Simple dashboards, mobile apps, external integrations
**⚠️ NOTE**: This endpoint returns FLAT structure (no nesting)

#### Request

```http
GET /api/overview?from=2025-10-01&to=2025-10-10&tz=Asia/Kolkata
```

**Query Parameters:**
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `from` | string | No | Start date (ISO 8601) | `2025-10-01` |
| `to` | string | No | End date (ISO 8601) | `2025-10-10` |
| `tz` | string | No | Timezone | `Asia/Kolkata` |

**Defaults:**
- `from`: 14 days ago
- `to`: Today
- `tz`: `Asia/Kolkata`

#### Response (200 OK)

```typescript
{
  captured: number;           // Total transactions captured
  inSettlement: number;       // Transactions in settlement queue
  sentToBank: number;         // Transactions sent to bank
  credited: number;           // Successfully credited transactions
  unsettled: number;          // Transactions not in pipeline
  capturedValue: number;      // Total value in paise
  creditedValue: number;      // Credited value in paise
  warnings: string[];         // Any data consistency warnings
}
```

**Example Response:**
```json
{
  "captured": 194,
  "inSettlement": 116,
  "sentToBank": 0,
  "credited": 50,
  "unsettled": 28,
  "capturedValue": 1825123025,
  "creditedValue": 124369900,
  "warnings": []
}
```

**Data Source**: `sp_v2_transactions`, `sp_v2_settlement_batches`
**Refresh Rate**: Real-time (direct DB query)

---

## 2. OPERATIONS OVERVIEW API

### GET `/api/ops/overview`

**Purpose**: Fetch complete operations dashboard data (reconciliation + settlement + exceptions)
**Use Case**: Operations dashboard, internal reporting
**⚠️ NOTE**: This is the PRIMARY endpoint for the ops dashboard

#### Request

```http
GET /api/ops/overview?from=2025-10-03&to=2025-10-10&tz=Asia/Kolkata
```

**Query Parameters:** Same as `/api/overview`

#### Response (200 OK)

```typescript
{
  window: {
    from: string;          // Start date (YYYY-MM-DD)
    to: string;            // End date (YYYY-MM-DD)
    tz: string;            // Timezone
    label: string;         // Human-readable label ("Last 7 days")
  };
  tiles: {
    reconRate: {
      matched: number;     // Number of matched transactions
      total: number;       // Total transactions reconciled
      pct: number;         // Match rate percentage (0-100)
      deltaPct: number;    // Change from previous period
    };
    unmatchedValue: {
      amount: number;      // Total unmatched value in paise
      txnCount: number;    // Count of unmatched transactions
      deltaPct: number;
    };
    openExceptions: {
      count: number;       // Total reconciliation exceptions
      high: number;        // High severity count
      critical: number;    // Critical severity count
      deltaPct: number;
    };
    creditedToMerchant: {
      amount: number;      // Total credited in paise
      txnCount: number;    // Count of credited transactions
      deltaPct: number;
    };
  };
  pipeline: {
    totalCaptured: number;
    raw: {
      inSettlement: number;  // Cumulative count in settlement
      sentToBank: number;    // Cumulative count sent to bank
      creditedUtr: number;   // Cumulative count credited
    };
    exclusive: {
      inSettlementOnly: number;  // ONLY in settlement (mutually exclusive)
      sentToBankOnly: number;    // ONLY sent to bank
      credited: number;          // ONLY credited
      unsettled: number;         // ONLY unsettled
    };
    warnings: string[];
  };
  bySource: {
    manual: {
      matched: number;
      total: number;
      pct: number;         // Match rate for manual uploads
    };
    connector: {
      matched: number;
      total: number;
      pct: number;         // Match rate for connector data
    };
  };
  topReasons: {
    mode: string;          // "impacted"
    rows: Array<{
      reason: string;      // Exception reason
      count: number;       // Count of this exception
      pct: number;         // Percentage of total exceptions
    }>;
    total: number;         // Total exceptions
  };
  definitions: {
    reconRate: string;
    unmatchedValue: string;
    // ... tooltip definitions
  };
}
```

**Example Response:**
```json
{
  "window": {
    "from": "2025-10-03",
    "to": "2025-10-10",
    "tz": "Asia/Kolkata",
    "label": "Last 7 days"
  },
  "tiles": {
    "reconRate": {
      "matched": 10,
      "total": 32,
      "pct": 31,
      "deltaPct": 0
    },
    "unmatchedValue": {
      "amount": 0,
      "txnCount": 42,
      "deltaPct": 0
    },
    "openExceptions": {
      "count": 3,
      "high": 1,
      "critical": 2,
      "deltaPct": 0
    },
    "creditedToMerchant": {
      "amount": 124369900,
      "txnCount": 50,
      "deltaPct": 0
    }
  },
  "pipeline": {
    "totalCaptured": 194,
    "raw": {
      "inSettlement": 116,
      "sentToBank": 0,
      "creditedUtr": 50
    },
    "exclusive": {
      "inSettlementOnly": 116,
      "sentToBankOnly": 0,
      "credited": 50,
      "unsettled": 28
    },
    "warnings": []
  },
  "bySource": {
    "manual": {
      "matched": 2,
      "total": 9,
      "pct": 22.22
    },
    "connector": {
      "matched": 7,
      "total": 22,
      "pct": 31.82
    }
  },
  "topReasons": {
    "mode": "impacted",
    "rows": [
      {
        "reason": "Duplicate UTR",
        "count": 2,
        "pct": 66.7
      },
      {
        "reason": "Missing UTR",
        "count": 1,
        "pct": 33.3
      }
    ],
    "total": 3
  },
  "definitions": {
    "reconRate": "Percentage of transactions successfully matched between payment gateway and bank records",
    "unmatchedValue": "Total value of transactions that could not be reconciled within the window",
    "openExceptions": "Exceptions requiring manual intervention (open, investigating, or escalated status)",
    "creditedToMerchant": "Confirmed bank credits with UTR posted to merchant accounts",
    "inSettlementOnly": "Transactions initiated for settlement but not yet sent to bank",
    "sentToBankOnly": "Transactions sent to bank but not yet credited",
    "credited": "Transactions successfully credited with confirmed UTR",
    "unsettled": "Transactions not yet in the settlement pipeline"
  }
}
```

**Data Sources**:
- `sp_v2_reconciliation_jobs`
- `sp_v2_reconciliation_results`
- `sp_v2_transactions`
- `sp_v2_settlement_batches`

**Refresh Rate**: Real-time
**Caching**: None (always fresh data)

---

## 3. KPIS API

### GET `/api/kpis`

**Purpose**: Fetch key performance indicators for a specific role
**Role-based**: Returns different data based on `X-User-Role` header

#### Request

```http
GET /api/kpis?from=2025-10-01&to=2025-10-10&merchantId=MERCHANT_001&acquirerId=HDFC
Headers:
  X-User-Role: sp-ops
  X-Merchant-Id: MERCHANT_001
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Start date |
| `to` | string | Yes | End date |
| `merchantId` | string | No | Filter by merchant |
| `acquirerId` | string | No | Filter by acquirer |

**Headers:**
| Header | Values | Description |
|--------|--------|-------------|
| `X-User-Role` | `sp-ops`, `sp-finance`, `merchant` | User role |
| `X-Merchant-Id` | UUID | Merchant ID (for merchant role) |

#### Response (200 OK)

```typescript
{
  timeRange: {
    fromISO: string;
    toISO: string;
  };
  totals: {
    transactionsCount: number;
    totalAmountPaise: string;      // BigInt serialized as string
    reconciledAmountPaise: string;
    variancePaise: string;
  };
  recon: {
    matchRatePct: number;          // 0-100
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
  };
  settlements?: {                   // Only for sp-finance role
    batchCount: number;
    lastCycleISO: string;
    netToMerchantsPaise: string;
  };
  connectorHealth: Array<{
    connector: string;
    status: 'ok' | 'degraded' | 'down';
    lastSyncISO: string;
  }>;
}
```

**Role-Specific Fields:**
- `settlements` - Only included if `X-User-Role: sp-finance`

---

## 4. PIPELINE API

### GET `/api/pipeline/summary`

**Purpose**: Fetch settlement pipeline summary
**Used by**: Settlement Pipeline component

#### Request

```http
GET /api/pipeline/summary?from=2025-10-01&to=2025-10-10
```

#### Response (200 OK)

```typescript
{
  ingested: number;       // Total captured
  inSettlement: number;   // In settlement queue
  reconciled: number;     // Sent to bank (mapped from sentToBank)
  settled: number;        // Credited (mapped from credited)
  unsettled: number;      // Not in pipeline
}
```

**⚠️ Mapping Note:**
- `reconciled` → Actually means "sent to bank"
- `settled` → Actually means "credited"
- This is for backward compatibility

---

## 5. EXCEPTIONS API

### GET `/api/exceptions/top-reasons`

**Purpose**: Fetch top exception reasons
**Sorted by**: Count (descending)

#### Request

```http
GET /api/exceptions/top-reasons
```

#### Response (200 OK)

```typescript
Array<{
  reasonCode: string;    // Exception reason code
  count: number;         // Number of occurrences
}>
```

**Example:**
```json
[
  { "reasonCode": "MISSING_UTR", "count": 32 },
  { "reasonCode": "DUPLICATE_UTR", "count": 16 },
  { "reasonCode": "AMOUNT_MISMATCH", "count": 14 }
]
```

### GET `/api/exceptions/top-reasons-detailed`

**Purpose**: Fetch top reasons with severity breakdown
**Query Parameters:**
- `limit`: Number of reasons (default: 5)
- `from`: Start date
- `to`: End date

#### Response (200 OK)

```typescript
Array<{
  reasonCode: string;
  label: string;
  count: number;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}>
```

### GET `/api/exceptions/severity-split`

**Purpose**: Fetch exception count by severity

#### Response (200 OK)

```typescript
{
  critical: number;
  high: number;
  medium: number;
  low: number;
}
```

---

## 6. RECONCILIATION SOURCES API

### GET `/api/recon-sources/summary`

**Purpose**: Fetch reconciliation breakdown by source (manual vs connectors)

#### Request

```http
GET /api/recon-sources/summary?from=2025-10-01&to=2025-10-10
```

#### Response (200 OK)

```typescript
{
  timeRange: {
    fromISO: string;
    toISO: string;
  };
  overall: {
    matchedPct: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    totalTransactions: number;
  };
  connectors: {
    totalTransactions: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    matchedPct: number;
    lastUpdated?: string;
    hasActualData: boolean;    // True if real data, false if estimated
  };
  manualUpload: {
    totalTransactions: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    matchedPct: number;
    lastUpdated?: string;
    hasActualData: boolean;
  };
}
```

---

## 7. ANALYTICS API

### GET `/api/analytics/mode-distribution`

**Purpose**: Settlement breakdown by payment mode

#### Response (200 OK)

```typescript
{
  modes: Array<{
    mode: 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'QR';
    settledCount: number;
    settledAmount: number;
    unsettledCount: number;
    unsettledAmount: number;
  }>;
}
```

### GET `/api/analytics/gmv-trend`

**Purpose**: GMV (Gross Merchandise Value) trend over time

**Query Parameters:**
- `from`, `to`: Date range
- `mode`: Filter by payment mode (optional)

#### Response (200 OK)

```typescript
{
  dataPoints: Array<{
    date: string;          // YYYY-MM-DD
    gmv: number;           // Total GMV in paise
    count: number;         // Transaction count
  }>;
}
```

### GET `/api/analytics/settlement-funnel`

**Purpose**: Settlement funnel conversion rates

#### Response (200 OK)

```typescript
{
  stages: Array<{
    stage: string;
    count: number;
    value: number;         // In paise
    dropoffPct: number;    // Percentage dropped from previous stage
  }>;
}
```

---

## 8. DISPUTES API

### GET `/api/disputes/kpis`

**Purpose**: Disputes & chargebacks KPIs

#### Response (200 OK)

```typescript
{
  totalDisputes: number;
  openDisputes: number;
  wonDisputes: number;
  lostDisputes: number;
  pendingEvidenceCount: number;
  totalValueAtRiskPaise: string;
  averageResolutionDays: number;
}
```

### GET `/api/chargebacks`

**Purpose**: List chargebacks with filters

**Query Parameters:**
- `status`: Filter by status
- `searchQuery`: Search by case ref, transaction ID
- `acquirer`: Filter by acquirer
- `slaBucket`: Filter by SLA bucket (on-time, due-soon, overdue)
- `limit`: Page size (default: 50)
- `offset`: Page offset (default: 0)
- `from`, `to`: Date range

#### Response (200 OK)

```typescript
{
  chargebacks: Array<{
    id: string;
    caseRef: string;
    merchantId: string;
    merchantName: string;
    transactionId: string;
    amountPaise: string;
    status: string;
    reason: string;
    acquirer: string;
    evidenceDueDate: string;
    slaBucket: 'on-time' | 'due-soon' | 'overdue';
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}
```

---

## ERROR RESPONSES

### 400 Bad Request

```json
{
  "error": "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to fetch overview data",
  "message": "Database connection error"
}
```

---

## VALIDATION RULES

### Date Parameters
- **Format**: ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
- **Range**: `from` must be before `to`
- **Max Range**: 365 days

### Amount Fields
- **Unit**: Always in paise (1 INR = 100 paise)
- **Type**: Integer for calculations, string for large numbers (BigInt)
- **Never use floats**: Avoid floating-point precision errors

### Percentage Fields
- **Range**: 0-100
- **Precision**: Max 2 decimal places
- **Format**: Number (not string)

---

## DEPRECATION NOTICES

### Deprecated Endpoints
None currently

### Breaking Changes (Planned)
- `/api/overview` may be deprecated in favor of `/api/v2/overview` (Q2 2026)

---

## MIGRATION GUIDE

### From `/api/overview` to `/api/ops/overview`

**Old Code:**
```typescript
const data = await fetch('/api/overview?from=X&to=Y');
const pipeline = data.pipeline; // ❌ This doesn't exist!
```

**New Code:**
```typescript
const data = await fetch('/api/ops/overview?from=X&to=Y');
const pipeline = data.pipeline; // ✅ Correct!
const tiles = data.tiles;       // ✅ Also available
```

**Key Differences:**
| Feature | `/api/overview` | `/api/ops/overview` |
|---------|----------------|---------------------|
| Structure | Flat | Nested |
| Reconciliation Data | ❌ No | ✅ Yes |
| Exceptions | ❌ No | ✅ Yes |
| By Source | ❌ No | ✅ Yes |
| Top Reasons | ❌ No | ✅ Yes |

---

## TESTING ENDPOINTS

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "overview-api",
  "port": 5108
}
```

---

**Version**: 1.0.0
**Maintained by**: Backend Team
**Last Review**: 2025-10-10
