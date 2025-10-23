# Financial Analytics API Documentation

**Endpoint**: `GET /api/analytics/financial`
**Port**: 5108
**Service**: Overview API
**Database**: V2 (sp_v2_settlement_batches)
**Date Created**: October 23, 2025

---

## Purpose

Provides cofounder-level financial metrics for SettlePaisa, including:
- GMV (Gross Merchandise Value)
- MDR collected from merchants
- Bank charges paid
- SettlePaisa net revenue
- Gross margin percentage
- Settlement amounts

---

## Request

### Endpoint
```
GET http://localhost:5108/api/analytics/financial
```

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `from` | string | ✅ Yes | Start date (YYYY-MM-DD) | `2025-10-01` |
| `to` | string | ✅ Yes | End date (YYYY-MM-DD) | `2025-10-23` |
| `merchantId` | string | ❌ No | Filter by specific merchant | `MERCH001` |
| `groupBy` | string | ❌ No | Group trends by: `day`, `week`, `month` | `day` |

### Example Requests

**Basic request (summary only)**:
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23"
```

**With daily trends**:
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23&groupBy=day"
```

**Filter by merchant**:
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23&merchantId=MERCH001"
```

**Weekly trends for specific merchant**:
```bash
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23&merchantId=MERCH001&groupBy=week"
```

---

## Response

### Success Response (200 OK)

```json
{
  "period": {
    "from": "2025-10-01",
    "to": "2025-10-23",
    "days": 23
  },
  "summary": {
    "gmv": {
      "paise": "65488624",
      "rupees": 654886.24,
      "formatted": "₹6.55 L"
    },
    "mdrCollected": {
      "paise": "1236574",
      "rupees": 12365.74,
      "formatted": "₹12.37 K"
    },
    "bankChargesPaid": {
      "paise": "1060",
      "rupees": 10.60,
      "formatted": "₹10.60"
    },
    "settlepaisaRevenue": {
      "paise": "1235514",
      "rupees": 12355.14,
      "formatted": "₹12.36 K"
    },
    "grossMarginPercent": 99.91,
    "netSettled": {
      "paise": "64009938",
      "rupees": 640099.38,
      "formatted": "₹6.40 L"
    },
    "transactionCount": 91,
    "merchantCount": 5,
    "batchCount": 16,
    "avgTransactionValue": {
      "paise": "719655",
      "rupees": 7196.55
    }
  },
  "trends": [
    {
      "date": "2025-10-04",
      "gmv": "9650075",
      "mdr": "119802",
      "bankCharges": "1060",
      "revenue": "118742",
      "netSettled": "9489179",
      "txnCount": 11,
      "marginPercent": 99.12
    }
  ]
}
```

### Response Fields

#### `period` object
| Field | Type | Description |
|-------|------|-------------|
| `from` | string | Start date of the query |
| `to` | string | End date of the query |
| `days` | number | Number of days in the period |

#### `summary` object
| Field | Type | Description | Formula |
|-------|------|-------------|---------|
| `gmv` | object | Gross Merchandise Value | SUM(gross_amount_paise) |
| `mdrCollected` | object | Total MDR collected from merchants | SUM(total_commission_paise) |
| `bankChargesPaid` | object | Total bank charges paid | SUM(total_bank_charges_paise) |
| `settlepaisaRevenue` | object | SettlePaisa's net revenue | SUM(settlepaisa_revenue_paise) |
| `grossMarginPercent` | number | Profit margin percentage | (revenue / mdr) × 100 |
| `netSettled` | object | Total settled to merchants | SUM(net_amount_paise) |
| `transactionCount` | number | Total number of transactions | SUM(total_transactions) |
| `merchantCount` | number | Number of unique merchants | COUNT(DISTINCT merchant_id) |
| `batchCount` | number | Number of settlement batches | COUNT(*) |
| `avgTransactionValue` | object | Average transaction size | gmv / transactionCount |

#### Amount Object Structure
Each amount field contains:
```json
{
  "paise": "1236574",      // Amount in paise (integer as string)
  "rupees": 12365.74,      // Amount in rupees (float)
  "formatted": "₹12.37 K"  // Human-readable format
}
```

#### `trends` array (optional, when groupBy is specified)
| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date/Period start (ISO format) |
| `gmv` | string | GMV in paise |
| `mdr` | string | MDR in paise |
| `bankCharges` | string | Bank charges in paise |
| `revenue` | string | SettlePaisa revenue in paise |
| `netSettled` | string | Net settled in paise |
| `txnCount` | number | Transaction count |
| `marginPercent` | number | Margin percentage |

---

## Error Responses

### 400 Bad Request - Missing Parameters
```json
{
  "error": "Missing required parameters",
  "message": "Both \"from\" and \"to\" date parameters are required (YYYY-MM-DD format)"
}
```

### 400 Bad Request - Invalid Date Format
```json
{
  "error": "Invalid date format",
  "message": "Dates must be in YYYY-MM-DD format"
}
```

### 400 Bad Request - Invalid groupBy
```json
{
  "error": "Invalid groupBy parameter",
  "message": "groupBy must be one of: day, week, month"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

## Business Logic

### Revenue Calculation
```
SettlePaisa Revenue = MDR Collected - Bank Charges Paid
```

**Example**:
- MDR collected from merchants: ₹12,365.74
- Bank charges paid to banks: ₹10.60
- SettlePaisa revenue: ₹12,355.14

### Gross Margin Calculation
```
Gross Margin % = (SettlePaisa Revenue / MDR Collected) × 100
```

**Example**:
- Revenue: ₹12,355.14
- MDR: ₹12,365.74
- Margin: 99.91%

### Settlement Flow
```
GMV (Customer Paid) → MDR Deducted → Net Settled to Merchant
```

**Example**:
- GMV: ₹654,886.24 (what customers paid)
- MDR: ₹12,365.74 (SettlePaisa's commission)
- Net: ₹640,099.38 (paid to merchants after deductions)

---

## Data Source

### Primary Table
**Table**: `sp_v2_settlement_batches`

**Columns Used**:
- `gross_amount_paise` → GMV
- `total_commission_paise` → MDR Collected
- `total_bank_charges_paise` → Bank Charges
- `settlepaisa_revenue_paise` → SettlePaisa Revenue
- `net_amount_paise` → Net Settled
- `total_transactions` → Transaction Count
- `cycle_date` → Date for grouping
- `merchant_id` → Merchant filter
- `status` → Only includes: COMPLETED, SENT_TO_BANK, APPROVED, PENDING_APPROVAL

**Query Example**:
```sql
SELECT
  SUM(gross_amount_paise) as total_gmv,
  SUM(total_commission_paise) as total_mdr,
  SUM(total_bank_charges_paise) as total_bank_charges,
  SUM(settlepaisa_revenue_paise) as total_revenue,
  SUM(net_amount_paise) as total_net_settled,
  SUM(total_transactions) as total_txn_count,
  COUNT(DISTINCT merchant_id) as merchant_count
FROM sp_v2_settlement_batches
WHERE cycle_date BETWEEN '2025-10-01' AND '2025-10-23'
  AND status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL');
```

---

## Currency Formatting

The API automatically formats amounts using Indian currency notation:

| Range | Format | Example |
|-------|--------|---------|
| ≥ 1 Crore | `₹X.XX Cr` | ₹1.50 Cr |
| ≥ 1 Lakh | `₹X.XX L` | ₹6.55 L |
| ≥ 1 Thousand | `₹X.XX K` | ₹12.37 K |
| < 1 Thousand | `₹X.XX` | ₹10.60 |

---

## Performance Considerations

- **Indexed Columns**: `cycle_date`, `merchant_id`, `status`
- **Query Optimization**: Uses aggregation at database level
- **Response Time**: Typically < 200ms for 1 month of data
- **Caching**: Not implemented (consider adding for production)

---

## Use Cases

### 1. Daily Revenue Dashboard
```bash
# Get last 7 days with daily breakdown
curl "http://localhost:5108/api/analytics/financial?from=2025-10-16&to=2025-10-23&groupBy=day"
```

### 2. Monthly Financial Report
```bash
# Get October 2025 summary
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-31"
```

### 3. Merchant-Specific Analytics
```bash
# Analyze specific merchant performance
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23&merchantId=MERCH001&groupBy=week"
```

### 4. YTD Performance
```bash
# Year-to-date with monthly trends
curl "http://localhost:5108/api/analytics/financial?from=2025-01-01&to=2025-10-23&groupBy=month"
```

---

## Frontend Integration Example

```javascript
// Fetch financial analytics
async function fetchFinancialAnalytics(from, to, groupBy = null) {
  const params = new URLSearchParams({ from, to });
  if (groupBy) params.append('groupBy', groupBy);

  const response = await fetch(`http://localhost:5108/api/analytics/financial?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}

// Usage
const analytics = await fetchFinancialAnalytics('2025-10-01', '2025-10-23', 'day');
console.log(`Revenue: ${analytics.summary.settlepaisaRevenue.formatted}`);
console.log(`Margin: ${analytics.summary.grossMarginPercent}%`);
```

---

## Testing

### Manual Testing
```bash
# Test basic functionality
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23"

# Test with trends
curl "http://localhost:5108/api/analytics/financial?from=2025-10-01&to=2025-10-23&groupBy=day"

# Test error handling
curl "http://localhost:5108/api/analytics/financial"
curl "http://localhost:5108/api/analytics/financial?from=invalid&to=2025-10-23"
```

### Expected Results
- ✅ Returns valid JSON
- ✅ All amounts are non-negative (except revenue can be negative if bank charges > MDR)
- ✅ GMV ≥ Net Settled
- ✅ Transaction count matches batch data
- ✅ Margin percent is between -100 and 100

---

## Known Limitations

1. **Historical Data**: Old settlement batches (before Oct 2025) may not have `total_bank_charges_paise` populated, leading to incorrect revenue calculations
2. **Real-time Updates**: Data is only as fresh as the last settlement batch creation
3. **Timezone**: All dates are treated as UTC
4. **Merchant Filter**: Only supports single merchant, not multiple
5. **Status Filter**: Hardcoded to include certain statuses only

---

## Future Enhancements

1. **Caching**: Add Redis caching for frequently accessed date ranges
2. **Comparison**: Add previous period comparison (WoW, MoM, YoY)
3. **Export**: Add CSV/Excel export functionality
4. **Filters**: Add payment mode, bank, and status filters
5. **Alerts**: Add threshold alerts (e.g., margin < 50%)
6. **Pagination**: Add pagination for trends when dataset is large

---

## Changelog

### v1.0.0 - October 23, 2025
- ✅ Initial implementation
- ✅ Summary metrics (GMV, MDR, Revenue, Margin)
- ✅ Trend support (day/week/month grouping)
- ✅ Merchant filtering
- ✅ Currency formatting
- ✅ Error handling

---

## Support

For issues or questions:
- Check service logs: `tail -f /tmp/overview-api.log`
- Verify database connection: `psql -h localhost -p 5433 -U postgres -d settlepaisa_v2`
- Check settlement batches: `SELECT COUNT(*) FROM sp_v2_settlement_batches;`

---

**Endpoint Ready**: ✅ YES
**Production Ready**: ⚠️ Needs testing with real data
**Documentation**: ✅ Complete
