# Settlement Analytics V2 - Implementation Plan

**Goal:** Power Settlement Analytics with real V2 settlement data from our production-ready tables

---

## 📊 Current State Analysis

### Existing Frontend
- ✅ `src/pages/ops/AnalyticsV3.tsx` - Settlement Analytics UI
- ✅ Professional charts, KPIs, filters
- ⚠️ Currently using mock/placeholder data

### Available V2 Data Sources
```
✅ sp_v2_settlement_batches       - Main settlement data (31 batches, ₹9.38L net)
✅ sp_v2_settlement_items         - Transaction-level details (199 items)
✅ sp_v2_transactions             - Source transactions (569 reconciled, 199 settled)
✅ sp_v2_bank_transfer_queue      - Bank transfer tracking
✅ sp_v2_rolling_reserve_ledger   - Reserve tracking (₹39K held)
✅ sp_v2_merchant_master          - Merchant metadata
✅ sp_v2_settlement_schedule_runs - Settlement run history
```

---

## 🎯 Analytics Components Mapping

### Image 1: Top Section

#### **1. Settled Transactions Card**
```
Current: 1,316 txns, ₹66.4Cr, +10 delta
V2 Data: sp_v2_settlement_items
Query:
  SELECT 
    COUNT(*) as settled_count,
    SUM(amount_paise) as settled_amount_paise,
    -- Delta: compare with previous period
  FROM sp_v2_settlement_items si
  JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
  WHERE sb.created_at BETWEEN $start AND $end
    AND sb.status IN ('APPROVED', 'PAID_OUT')
```

#### **2. Unsettled Transactions Card**
```
Current: 187 txns, ₹9.7Cr, +22 delta
V2 Data: sp_v2_transactions
Query:
  SELECT 
    COUNT(*) as unsettled_count,
    SUM(amount_paise) as unsettled_amount_paise
  FROM sp_v2_transactions
  WHERE status = 'RECONCILED'
    AND settlement_batch_id IS NULL
    AND transaction_date BETWEEN $start AND $end
```

#### **3. Settlement Rate Card**
```
Current: 87.6%, -1.2% delta
V2 Data: Calculated from above
Formula:
  settled_count / (settled_count + unsettled_count) * 100
```

#### **4. Avg Settlement Time Card**
```
Current: 1.2 days, +0.3 delta
V2 Data: sp_v2_transactions + sp_v2_settlement_batches
Query:
  SELECT 
    AVG(EXTRACT(EPOCH FROM (sb.created_at - t.transaction_date))/86400) as avg_days
  FROM sp_v2_transactions t
  JOIN sp_v2_settlement_batches sb ON t.settlement_batch_id = sb.id
  WHERE sb.created_at BETWEEN $start AND $end
```

#### **5. Payment Source Level Summary (Donut Chart)**
```
Current: 1,503 txns, ₹76Cr, breakdown by mode
V2 Data: sp_v2_settlement_items
Query:
  SELECT 
    payment_mode,
    COUNT(*) as txn_count,
    SUM(amount_paise) as total_amount_paise,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
  FROM sp_v2_settlement_items si
  JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
  WHERE sb.created_at BETWEEN $start AND $end
  GROUP BY payment_mode
  ORDER BY total_amount_paise DESC
```

#### **6. GMV Trend Analysis (Line Chart)**
```
Current: Captured GMV vs Settled GMV over time
V2 Data: sp_v2_transactions + sp_v2_settlement_batches
Query:
  -- Captured GMV (daily)
  SELECT 
    DATE(transaction_date) as date,
    SUM(amount_paise) as captured_gmv
  FROM sp_v2_transactions
  WHERE status IN ('RECONCILED', 'EXCEPTION')
    AND transaction_date BETWEEN $start AND $end
  GROUP BY DATE(transaction_date)
  
  -- Settled GMV (daily)
  SELECT 
    DATE(sb.created_at) as date,
    SUM(si.amount_paise) as settled_gmv
  FROM sp_v2_settlement_items si
  JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
  WHERE sb.created_at BETWEEN $start AND $end
  GROUP BY DATE(sb.created_at)
```

### Image 2: Bottom Section

#### **7. Settlement Funnel**
```
Current: Captured 100% → Reconciled 80% → Settled 76% → Paid Out 74%
V2 Data: sp_v2_transactions + sp_v2_settlement_batches + sp_v2_bank_transfer_queue
Query:
  -- Captured
  SELECT COUNT(*) FROM sp_v2_transactions 
  WHERE transaction_date BETWEEN $start AND $end
  
  -- Reconciled
  SELECT COUNT(*) FROM sp_v2_transactions 
  WHERE status = 'RECONCILED'
    AND transaction_date BETWEEN $start AND $end
  
  -- Settled (batches created)
  SELECT SUM(total_transactions) FROM sp_v2_settlement_batches
  WHERE created_at BETWEEN $start AND $end
  
  -- Paid Out
  SELECT COUNT(DISTINCT si.transaction_id)
  FROM sp_v2_settlement_items si
  JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
  WHERE sb.status = 'PAID_OUT'
    AND sb.created_at BETWEEN $start AND $end
```

#### **8. Settlement Rate Performance (Table)**
```
Current: Yesterday 92.3%, This Week 91.8%, This Month 90.7%
V2 Data: Calculated settlement rates
Query:
  WITH stats AS (
    SELECT 
      DATE_TRUNC('day', transaction_date) as period,
      COUNT(*) as total,
      COUNT(settlement_batch_id) as settled
    FROM sp_v2_transactions
    WHERE transaction_date >= NOW() - INTERVAL '30 days'
    GROUP BY period
  )
  SELECT 
    AVG(CASE WHEN period = CURRENT_DATE - 1 THEN settled*100.0/total END) as yesterday,
    AVG(CASE WHEN period >= CURRENT_DATE - 7 THEN settled*100.0/total END) as this_week,
    AVG(settled*100.0/total) as this_month
  FROM stats
```

#### **9. Settlement Failure Analysis (Donut + Table)**
```
Current: Bank Gateway Error 15.8%, Invalid Account 14.3%, etc.
V2 Data: sp_v2_bank_transfer_queue (for failures)
Note: Currently we don't have failure tracking in settlement
Workaround: Use sp_v2_transactions with status='EXCEPTION'

Query:
  SELECT 
    exception_reason as failure_reason,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
  FROM sp_v2_transactions
  WHERE status = 'EXCEPTION'
    AND transaction_date BETWEEN $start AND $end
  GROUP BY exception_reason
  ORDER BY count DESC
```

---

## 🏗️ Implementation Architecture

### Backend: Settlement Analytics API

**File:** `services/settlement-analytics-api/index.js`

**Endpoints:**
```javascript
GET  /analytics/kpis              - Top 4 KPI cards
GET  /analytics/payment-modes     - Payment mode breakdown (donut)
GET  /analytics/gmv-trend          - GMV trend (line chart)
GET  /analytics/funnel             - Settlement funnel
GET  /analytics/settlement-rate    - Settlement rate history
GET  /analytics/failure-analysis   - Failure reasons

Query params:
  ?startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
  &merchantId=MERCH001 (optional)
  &paymentMode=UPI (optional)
```

### Frontend Updates

**Files to Modify:**
1. `src/hooks/useAnalyticsV3.ts` - Update to call real API
2. `src/services/settlement-analytics.ts` - New service for API calls
3. `src/pages/ops/AnalyticsV3.tsx` - Wire up real data

---

## 📝 Implementation Steps

### Phase 1: Backend API (2 hours)

#### Step 1.1: Create Settlement Analytics API Service
```bash
mkdir -p services/settlement-analytics-api
touch services/settlement-analytics-api/index.js
touch services/settlement-analytics-api/package.json
```

**Port:** 5107 (next available)

#### Step 1.2: Implement Endpoints
- `/analytics/kpis` - Settled, unsettled, rate, avg time
- `/analytics/payment-modes` - Donut chart data
- `/analytics/gmv-trend` - Line chart data
- `/analytics/funnel` - Funnel percentages
- `/analytics/settlement-rate` - Historical rates
- `/analytics/failure-analysis` - Exception breakdown

#### Step 1.3: Add to start-services.sh
```bash
echo "Starting Settlement Analytics API on port 5107..."
```

### Phase 2: Frontend Service Layer (30 mins)

#### Step 2.1: Create Service
**File:** `src/services/settlement-analytics.ts`
```typescript
export async function fetchSettlementKpis(params: AnalyticsParams) {
  const response = await fetch(`http://localhost:5107/analytics/kpis?${queryString}`);
  return response.json();
}

export async function fetchPaymentModeBreakdown(params: AnalyticsParams) { ... }
export async function fetchGmvTrend(params: AnalyticsParams) { ... }
export async function fetchSettlementFunnel(params: AnalyticsParams) { ... }
```

### Phase 3: Frontend Hooks (30 mins)

#### Step 3.1: Update useAnalyticsV3.ts
```typescript
export function useAnalyticsKpisV3(params: AnalyticsParams) {
  return useQuery({
    queryKey: ['settlement-kpis', params],
    queryFn: () => fetchSettlementKpis(params)
  });
}
```

### Phase 4: UI Integration (1 hour)

#### Step 4.1: Wire up AnalyticsV3.tsx
- Replace mock data with real hooks
- Handle loading states
- Handle error states
- Add refresh functionality

### Phase 5: Testing (30 mins)

#### Step 5.1: Test all charts
- Verify KPI cards show correct data
- Verify donut chart breakdown
- Verify GMV trend line chart
- Verify funnel percentages
- Verify failure analysis

---

## 🎨 Data Flow

```
┌─────────────────────────────────────────────────────────┐
│              V2 PostgreSQL Database                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ sp_v2_settlement_batches                         │  │
│  │ sp_v2_settlement_items                           │  │
│  │ sp_v2_transactions                               │  │
│  │ sp_v2_bank_transfer_queue                        │  │
│  │ sp_v2_rolling_reserve_ledger                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│     Settlement Analytics API (Port 5107)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │ GET /analytics/kpis                              │  │
│  │ GET /analytics/payment-modes                     │  │
│  │ GET /analytics/gmv-trend                         │  │
│  │ GET /analytics/funnel                            │  │
│  │ GET /analytics/settlement-rate                   │  │
│  │ GET /analytics/failure-analysis                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│     Frontend Services (React Query)                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ src/services/settlement-analytics.ts             │  │
│  │ src/hooks/useAnalyticsV3.ts                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│     Settlement Analytics UI                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ src/pages/ops/AnalyticsV3.tsx                    │  │
│  │                                                   │  │
│  │ [KPI Cards] [Donut Chart] [Line Chart]           │  │
│  │ [Funnel] [Settlement Rate] [Failure Analysis]    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Sample API Responses

### GET /analytics/kpis
```json
{
  "settled": {
    "count": 199,
    "amount_paise": 100078439,
    "delta_count": 10,
    "delta_percent": 5.3
  },
  "unsettled": {
    "count": 370,
    "amount_paise": 185220961,
    "delta_count": 22,
    "delta_percent": 6.3
  },
  "settlement_rate": {
    "current": 87.6,
    "delta": -1.2
  },
  "avg_settlement_time": {
    "days": 1.2,
    "delta": 0.3
  }
}
```

### GET /analytics/payment-modes
```json
{
  "total_count": 199,
  "total_amount_paise": 100078439,
  "breakdown": [
    {
      "mode": "UPI",
      "count": 122,
      "amount_paise": 62300630,
      "percentage": 61.3
    },
    {
      "mode": "CARD",
      "count": 58,
      "amount_paise": 27698053,
      "percentage": 29.1
    },
    {
      "mode": "NETBANKING",
      "count": 19,
      "amount_paise": 10079756,
      "percentage": 9.5
    }
  ]
}
```

---

## 🚀 Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Backend API Service | 2h |
| 2 | Frontend Service Layer | 30m |
| 3 | Frontend Hooks | 30m |
| 4 | UI Integration | 1h |
| 5 | Testing & Polish | 30m |
| **Total** | | **4.5 hours** |

---

## ✅ Success Criteria

### Functional
- ✅ All KPI cards show real V2 data
- ✅ Donut chart reflects actual payment mode breakdown
- ✅ GMV trend shows real captured vs settled
- ✅ Settlement funnel shows actual conversion
- ✅ Settlement rate table shows historical rates
- ✅ Failure analysis shows real exception reasons

### Non-Functional
- ✅ API responds in < 500ms
- ✅ Charts update when date range changes
- ✅ Filters work (merchant, mode, acquirer)
- ✅ Loading states shown during fetch
- ✅ Error handling for API failures

---

## 🔧 Implementation Order

### Recommended Approach: Bottom-Up

1. **Start with Backend API** (most important)
   - Create service structure
   - Implement KPIs endpoint first (simplest)
   - Test with curl/Postman
   - Then add other endpoints one by one

2. **Then Frontend Service Layer**
   - Create API client functions
   - Add TypeScript types

3. **Then Hooks**
   - Wrap API calls with React Query
   - Add caching, refetch logic

4. **Finally UI**
   - Wire up one component at a time
   - Start with KPI cards (easiest)
   - Then donut chart
   - Then line chart
   - Then funnel
   - Finally failure analysis

---

## 📦 Dependencies

### Backend
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.0",
  "cors": "^2.8.5"
}
```

### Frontend
Already installed:
- `@tanstack/react-query`
- `echarts-for-react`
- `date-fns`

---

## 🎯 Next Steps After This

Once analytics is powered:
1. ✅ Build Approval UI (`src/pages/ops/Approvals.tsx`)
2. ✅ Add settlement batch export
3. ✅ Add merchant-level settlement reports
4. ✅ Add settlement reconciliation (V2 vs bank confirmation)
5. ✅ Add settlement scheduling UI

---

**Ready to implement?** Let me know if you approve this plan, and I'll start with Phase 1 (Backend API).
