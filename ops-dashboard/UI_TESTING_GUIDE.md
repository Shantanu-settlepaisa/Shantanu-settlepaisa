# UI Testing Guide - Webhook Settlement Integration

**Date**: October 6, 2025  
**Environment**: Localhost (Mac)  
**All changes are LOCAL only** - Not deployed to AWS yet

---

## 🚀 Quick Start

### **1. Open Local Dashboard**
```
http://localhost:5174
```

### **2. Navigate to Settlement Pages**

#### **Option A: Settlement Pipeline (Recommended)**
```
http://localhost:5174/ops/settlement-pipeline
```

#### **Option B: Latest Webhook Batch Details**
```
http://localhost:5174/ops/settlements/6eef1add-ea53-4a87-8164-baf8f4d81a34
```

---

## ✅ **What to Verify on UI**

### **1. Settlement Batch List**

**Page**: `/ops/settlement-pipeline` or `/merchant/settlements`

**Look for:**
- ✅ Batch ID: `6eef1add-ea53-4a87-8164-baf8f4d81a34`
- ✅ Merchant: `550e8400-e29b-41d4-a716-446655440001` (Webhook Test Merchant)
- ✅ Cycle Date: `2025-09-30`
- ✅ Total Transactions: **12** (all webhooks!)
- ✅ Net Amount: **₹2,440.00**
- ✅ Status: `PENDING_APPROVAL`

**Expected UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Settlement Batches                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Merchant: Webhook Test Merchant                       │
│  Cycle Date: Sep 30, 2025                              │
│  Transactions: 12                                       │
│  Net Amount: ₹2,440.00                                 │
│  Status: PENDING_APPROVAL                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

### **2. Settlement Items (Transaction Details)**

**Page**: `/ops/settlements/6eef1add-ea53-4a87-8164-baf8f4d81a34`

**Look for these transactions:**

| Transaction ID | Source Type | Status | Payment Mode | Amount |
|---------------|-------------|--------|--------------|--------|
| PGW17592301073920 | **WEBHOOK** | **SUCCESS** | UPI | ₹277.46 |
| PGW17592301073982 | **WEBHOOK** | **SUCCESS** | UPI | ₹139.81 |
| PGW17592301073993 | **WEBHOOK** | **SUCCESS** | UPI | ₹110.18 |
| PGW17592301074004 | **WEBHOOK** | **SUCCESS** | UPI | ₹65.88 |
| PGW17592301074028 | **WEBHOOK** | **SUCCESS** | UPI | ₹251.96 |

**Key Indicators:**
- ✅ `source_type` column shows **"WEBHOOK"** (not MANUAL_UPLOAD)
- ✅ `status` column shows **"SUCCESS"** (not RECONCILED)
- ✅ All 12 items are webhook transactions
- ✅ FK constraint working (items linked to transactions)

---

### **3. Settlement Summary/Breakdown**

**Expected Calculations:**
- **Gross Amount**: ₹2,603.80 (sum of 12 webhook transactions)
- **MDR Commission** (2%): ₹52.08
- **GST** (18% on commission): ₹9.38
- **Rolling Reserve** (4%): ₹101.69
- **Net Settlement**: ₹2,440.65

---

## 🔍 **Database Verification (Behind the Scenes)**

If UI doesn't load, verify data directly:

### **Check Settlement Batch**
```bash
node -e "const { Pool } = require('pg'); const pool = new Pool({ host: 'localhost', port: 5433, user: 'postgres', password: 'settlepaisa123', database: 'settlepaisa_v2' }); pool.query(\"SELECT * FROM sp_v2_settlement_batches WHERE id = '6eef1add-ea53-4a87-8164-baf8f4d81a34'\").then(r => console.table(r.rows)).finally(() => pool.end())"
```

### **Check Settlement Items with Source**
```bash
node -e "const { Pool } = require('pg'); const pool = new Pool({ host: 'localhost', port: 5433, user: 'postgres', password: 'settlepaisa123', database: 'settlepaisa_v2' }); pool.query(\"SELECT si.transaction_id, t.source_type, t.status, t.payment_mode, si.amount_paise/100 as amount FROM sp_v2_settlement_items si JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id WHERE si.settlement_batch_id = '6eef1add-ea53-4a87-8164-baf8f4d81a34'\").then(r => console.table(r.rows)).finally(() => pool.end())"
```

---

## 🎯 **Proof Points - What Success Looks Like**

### **Before Integration:**
- ❌ 376 webhook transactions stuck in sp_v2_transactions_v1
- ❌ Settlement calculator ignored SUCCESS status
- ❌ No webhook settlements created

### **After Integration:**
- ✅ 376 webhook transactions migrated to sp_v2_transactions
- ✅ Settlement calculator processes SUCCESS status
- ✅ **12 webhook transactions settled** (batch `6eef1add-ea53-4a87-8164-baf8f4d81a34`)
- ✅ 307 webhook transactions still pending (ready for next run)

---

## 📊 **API Endpoints to Test**

### **Get Settlement Batches**
```bash
curl http://localhost:5108/api/settlement/batches | jq
```

### **Get Settlement Items for Batch**
```bash
curl "http://localhost:5108/api/settlement/batches/6eef1add-ea53-4a87-8164-baf8f4d81a34/items" | jq
```

### **Get Webhook Transactions Status**
```bash
curl "http://localhost:5103/api/transactions?source_type=WEBHOOK&status=SUCCESS" | jq
```

---

## 🐛 **Troubleshooting**

### **If Settlement Page is Empty:**
1. Check backend services running:
   ```bash
   ps aux | grep -E "settlement|overview|recon" | grep node
   ```

2. Check if batch exists:
   ```bash
   node -e "const { Pool } = require('pg'); const pool = new Pool({ host: 'localhost', port: 5433, user: 'postgres', password: 'settlepaisa123', database: 'settlepaisa_v2' }); pool.query('SELECT COUNT(*) FROM sp_v2_settlement_batches').then(r => console.log('Total batches:', r.rows[0].count)).finally(() => pool.end())"
   ```

### **If Transactions Don't Show Source Type:**
- The UI might not be displaying the `source_type` column
- Check browser console for API errors
- Verify API response includes source_type:
  ```bash
  curl http://localhost:5108/api/settlement/batches/6eef1add-ea53-4a87-8164-baf8f4d81a34/items | jq '.items[] | {transaction_id, source_type, status}'
  ```

---

## 📋 **UI Components to Check**

### **Files that Display Settlement Data:**
1. `/src/pages/ops/SettlementPipelineDemo.tsx` - Main settlement dashboard
2. `/src/pages/ops/SettlementDetails.tsx` - Batch details page
3. `/src/pages/merchant/Settlements.tsx` - Merchant view
4. `/src/components/settlement/*` - Settlement UI components

### **Backend APIs:**
1. `services/overview-api/overview-v2.js` - Settlement aggregations
2. `services/recon-api/routes/reports.js` - Settlement reports
3. `services/settlement-engine/*` - Settlement calculation

---

## ✅ **Acceptance Criteria**

For the webhook settlement integration to be considered successful, you should see:

- [ ] Settlement batch exists with 12 transactions
- [ ] All 12 transactions have `source_type = 'WEBHOOK'`
- [ ] All 12 transactions have `status = 'SUCCESS'`
- [ ] Net settlement amount = ₹2,440.00
- [ ] Settlement items linked via FK (no orphans)
- [ ] Batch status = PENDING_APPROVAL
- [ ] UI displays all webhook transaction details

---

## 🚀 **Next Steps After UI Verification**

1. ✅ Verify settlement batch displays correctly
2. ✅ Verify webhook transactions show in settlement items
3. ✅ Test settlement approval workflow (if implemented)
4. 📦 Deploy to AWS staging
5. 🧪 Test on staging environment

---

## 📞 **Quick Links**

- **Local Dashboard**: http://localhost:5174/ops/settlement-pipeline
- **Latest Webhook Batch**: http://localhost:5174/ops/settlements/6eef1add-ea53-4a87-8164-baf8f4d81a34
- **Test Results**: `/Users/shantanusingh/ops-dashboard/test-settlement-integration.cjs`
- **Implementation Summary**: `/Users/shantanusingh/ops-dashboard/WEBHOOK_SETTLEMENT_COMPLETE.md`
