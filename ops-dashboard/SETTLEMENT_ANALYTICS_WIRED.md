# Settlement Analytics - Wired to V2 Database ✅

**Date:** October 2, 2025  
**Status:** Backend complete, Frontend needs refresh

---

## ✅ What's Done

### **Settlement Analytics API (Port 5107)**
- 6 endpoints querying V2 tables
- Returns real data from `sp_v2_transactions`, `sp_v2_settlement_items`, `sp_v2_settlement_batches`
- All endpoints tested and working

### **Current Real Data (from V2 database):**

#### **KPIs:**
```json
{
  "settled": { "count": 569, "amount_paise": 295758102 },
  "unsettled": { "count": 137, "amount_paise": 67477612 },
  "settlement_rate": 80.6,
  "avg_settlement_time_hours": "190.9",
  "paid_out_count": 0
}
```

#### **Payment Modes:**
```json
{
  "breakdown": [
    { "payment_method": "UPI", "count": 426, "amount_paise": 218706059 },
    { "payment_method": "CARD", "count": 193, "amount_paise": 95421889 },
    { "payment_method": "NETBANKING", "count": 81, "amount_paise": 46283700 },
    { "payment_method": "WALLET", "count": 6, "amount_paise": 2824066 }
  ]
}
```

#### **Settlement Funnel:**
```json
{
  "funnel": {
    "captured": { "count": 706, "percentage": 100 },
    "reconciled": { "count": 706, "percentage": "100.0" },
    "settled": { "count": 199, "percentage": "28.2" },
    "paid_out": { "count": 0, "percentage": "0.0" }
  }
}
```

#### **GMV Trend (Last 30 days):**
```json
{
  "trend": [
    { "date": "2025-09-24", "count": 28, "amount_paise": 14462510, "settled_count": 25, "settlement_rate": "89.3" },
    { "date": "2025-09-25", "count": 19, "amount_paise": 10511887, "settled_count": 16, "settlement_rate": "84.2" },
    ...
  ]
}
```

---

## 🔌 Frontend Integration

### **Updated Files:**
- `src/hooks/useAnalyticsV3.ts` - Changed API_BASE from Port 5105 → Port 5107
- Endpoint mapping:
  - `/kpis-v2` → `/kpis` ✅
  - `/gmv-trend-v2` → `/gmv-trend` ✅
  - `/settlement-funnel` → `/funnel` ✅
  - `/modes/share` → `/payment-modes` ✅
  - `/settlement-failures/breakup` → `/failure-analysis` ✅

### **Current Page:**
- Route: `/ops/analytics`
- Component: `AnalyticsV3.tsx`
- Uses hooks from `useAnalyticsV3.ts`

---

## 📊 What You Should See (After Refresh)

### **Top Tiles:**
```
✅ Settled Transactions:     569 txns, ₹29.5 lakhs (80.6% rate)
⚠️  Unsettled Transactions:   137 txns, ₹6.7 lakhs  
⏱️  Avg Settlement Time:      190.9 hours (~8 days)
💰 Paid Out:                  0 txns
```

### **Payment Mode Donut:**
```
📱 UPI:         426 txns (60.3%)
💳 CARD:        193 txns (27.3%)
🏦 NETBANKING:   81 txns (11.5%)
👛 WALLET:        6 txns (0.9%)
```

### **Settlement Funnel:**
```
Captured:    706 (100%)
     ↓
Reconciled:  706 (100%)
     ↓
Settled:     199 (28.2%)
     ↓
Paid Out:      0 (0%)
```

### **GMV Trend:**
Line chart showing daily transaction count and amounts from last 30 days

---

## 🚀 Next Steps

### **1. Refresh Frontend (Hard Refresh)**
```bash
# In browser at http://localhost:5174/ops/analytics
Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
```

### **2. If Still Shows Mock Data:**

**Option A: Check if Vite dev server needs restart**
```bash
# Stop frontend
ps aux | grep vite | grep 5174 | awk '{print $2}' | xargs kill -9

# Restart
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
```

**Option B: Clear browser cache**
- Open DevTools (F12)
- Right-click refresh button → "Empty Cache and Hard Reload"

### **3. Verify API is Running:**
```bash
# Check Settlement Analytics API
curl http://localhost:5107/health

# Should return:
# { "status": "healthy", "service": "settlement-analytics-api", "port": 5107 }
```

### **4. Check Network Tab in DevTools:**
- Look for requests to `http://localhost:5107/analytics/kpis`
- If you see 5105 instead, frontend cache needs clearing

---

## 🔍 Troubleshooting

### **Problem: Still seeing 5,000 transactions instead of 706**
**Cause:** Frontend using cached bundle with old API endpoint (5105)  
**Fix:** Hard refresh browser (Cmd+Shift+R)

### **Problem: API returns 404**
**Cause:** Settlement Analytics API not running  
**Fix:** 
```bash
cd /Users/shantanusingh/ops-dashboard/services/settlement-analytics-api
node index.js > /tmp/analytics-api.log 2>&1 &
```

### **Problem: CORS error in browser console**
**Cause:** API doesn't have CORS enabled  
**Fix:** Already added `app.use(cors())` in index.js ✅

---

## 📋 API Endpoints Summary

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/analytics/kpis` | GET | KPIs (settled, unsettled, rate, time, paid out) | JSON object |
| `/analytics/payment-modes` | GET | Payment mode breakdown | `{ breakdown: [...] }` |
| `/analytics/gmv-trend?days=30` | GET | Daily GMV trend | `{ trend: [...] }` |
| `/analytics/funnel` | GET | Settlement funnel | `{ funnel: {...} }` |
| `/analytics/settlement-rate` | GET | Settlement rate performance | `{ performance: {...} }` |
| `/analytics/failure-analysis` | GET | Failure reasons | `{ failures: [...] }` |
| `/health` | GET | Health check | `{ status: 'healthy' }` |

---

## 🎯 Expected vs Actual

### **Expected (What Frontend Shows Now):**
- 5,000 transactions (mock data)
- ₹254 Cr volume (mock data)
- Even distribution across modes

### **Actual (What V2 Database Has):**
- 706 transactions (real test data)
- ₹3.6 Cr volume (real amounts)
- UPI dominant (60%), realistic distribution

**After refresh, you should see the ACTUAL numbers (706 transactions, ₹3.6 Cr).**

---

## ✅ Verification Checklist

- [x] Settlement Analytics API running on Port 5107
- [x] All 6 endpoints returning real V2 data
- [x] Frontend hooks updated to call Port 5107
- [x] Endpoint paths mapped correctly
- [ ] Frontend hard refresh to load new bundle
- [ ] Browser DevTools shows requests to Port 5107
- [ ] Dashboard displays 706 transactions (not 5,000)

---

**Status:** Backend complete ✅  
**Next:** Hard refresh browser at http://localhost:5174/ops/analytics
