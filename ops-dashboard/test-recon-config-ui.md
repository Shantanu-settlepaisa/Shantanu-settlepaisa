# ✅ Recon Config UI - End-to-End Test Plan

**Date:** October 3, 2025  
**Component:** ReconConfigDrawer.tsx (New Implementation)  
**API:** http://localhost:5103/bank-mappings

---

## 🧪 Test Scenarios

### **Test 1: List View - Display All Banks**

**Steps:**
1. Open Ops Dashboard: http://localhost:5174/ops/workspace
2. Click "Settings" icon or "Recon Config" button
3. Verify drawer opens with title "Bank Column Mappings"

**Expected Result:**
- ✅ Shows "Configured Banks (21)"
- ✅ Grid displays 21 bank cards (3 columns)
- ✅ Each card shows:
  - Bank name (e.g., "HDFC BANK")
  - Config name (e.g., "HDFC BANK")
  - File type badge (e.g., "XLSX")
  - Delimiter (if applicable, e.g., "Delim: ~" for AXIS)
  - Field count (e.g., "5 fields")
  - Source (e.g., "V1_MIGRATED")
- ✅ "Add New Bank" button visible at top-right
- ✅ Hover effect on cards (border-blue-500)

**API Call:**
```bash
curl http://localhost:5103/bank-mappings
```

---

### **Test 2: Detail View - View HDFC Bank Mapping**

**Steps:**
1. From list view, click on "HDFC BANK" card
2. Verify detail view opens

**Expected Result:**
- ✅ Breadcrumb shows: "All Banks > HDFC BANK"
- ✅ Bank header shows:
  - Title: "HDFC BANK"
  - Config Name: "HDFC BANK"
  - Badges: "XLSX", "V1_MIGRATED"
- ✅ Info banner explains two-stage normalization
- ✅ Required V1 Fields section shows 4 fields:
  - Transaction ID → MERCHANT_TRACKID
  - Paid Amount → DOMESTIC AMT
  - Payee Amount → Net Amount
  - Transaction Date Time → TRANS DATE
- ✅ Optional V1 Fields section shows 1 field:
  - Payment Date Time → SETTLE DATE
- ✅ Each field shows:
  - V1 field name with description
  - V2 equivalent tooltip
  - Bank column name (read-only)
  - Required/Optional badge
  - Data type badge (string/amount/date)
- ✅ "Edit" and "Delete" buttons visible

**API Call:**
```bash
curl http://localhost:5103/bank-mappings/HDFC%20BANK | jq '.mapping.v1_column_mappings'
```

---

### **Test 3: Edit Mode - Update AXIS Bank Mapping**

**Steps:**
1. From list view, click on "AXIS BANK"
2. Click "Edit" button
3. Modify "Transaction ID" from "PRNNo" to "TXN_REF"
4. Click "Save Changes"

**Expected Result:**
- ✅ Input fields become editable
- ✅ Footer shows "Cancel" and "Save Changes" buttons
- ✅ Typing in field updates state
- ✅ On save:
  - "Saving..." spinner appears
  - API PUT request sent
  - Success message "Saved successfully" appears
  - Edit mode exits
  - Input fields become read-only
- ✅ Data persists (refresh and verify)

**API Call:**
```bash
curl -X PUT http://localhost:5103/bank-mappings/AXIS%20BANK \
  -H "Content-Type: application/json" \
  -d '{"v1_column_mappings": {"transaction_id": "TXN_REF", "paid_amount": "Amount", "payee_amount": "Amount", "transaction_date_time": "Date", "payment_date_time": "Date"}}'
```

**Verify:**
```bash
curl http://localhost:5103/bank-mappings/AXIS%20BANK | jq '.mapping.v1_column_mappings.transaction_id'
# Should return: "TXN_REF"
```

---

### **Test 4: Add New Bank - Create KOTAK BANK**

**Steps:**
1. From list view, click "Add New Bank" button
2. Fill in form:
   - Config Name: `KOTAK BANK`
   - Bank Name: `Kotak Mahindra Bank`
   - File Type: `xlsx`
   - Delimiter: (leave empty)
   - Transaction ID: `REF_NO`
   - Paid Amount: `TXN_AMT`
   - Payee Amount: `NET_AMT`
   - Transaction Date Time: `TXN_DATE`
   - Payment Date Time: (leave empty)
3. Click "Create Bank Mapping"

**Expected Result:**
- ✅ Form shows all V1 fields with empty inputs
- ✅ Required fields marked with `*`
- ✅ Create button disabled until required fields filled
- ✅ On create:
  - "Creating..." spinner appears
  - API POST request sent
  - Success message "Saved successfully"
  - Redirects to list view after 1.5s
  - New bank appears in grid (22 banks total)

**API Call:**
```bash
curl -X POST http://localhost:5103/bank-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "config_name": "KOTAK BANK",
    "bank_name": "Kotak Mahindra Bank",
    "file_type": "xlsx",
    "delimiter": null,
    "v1_column_mappings": {
      "transaction_id": "REF_NO",
      "paid_amount": "TXN_AMT",
      "payee_amount": "NET_AMT",
      "transaction_date_time": "TXN_DATE"
    }
  }'
```

**Verify:**
```bash
curl http://localhost:5103/bank-mappings | jq '.count'
# Should return: 22

curl http://localhost:5103/bank-mappings/KOTAK%20BANK | jq '.success'
# Should return: true
```

---

### **Test 5: Delete Bank - Remove KOTAK BANK**

**Steps:**
1. From list view, click on "KOTAK BANK" (newly created)
2. Click "Delete" button
3. Confirm deletion in browser alert

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ On confirm:
  - API DELETE request sent
  - Bank removed from list
  - Returns to list view
  - Bank count decreases to 21

**API Call:**
```bash
curl -X DELETE http://localhost:5103/bank-mappings/KOTAK%20BANK
```

**Verify:**
```bash
curl http://localhost:5103/bank-mappings | jq '.count'
# Should return: 21

curl http://localhost:5103/bank-mappings/KOTAK%20BANK | jq '.success'
# Should return: false (404 error)
```

---

### **Test 6: Navigation & Breadcrumbs**

**Steps:**
1. From list view, click "HDFC BANK"
2. Click "All Banks" in breadcrumb
3. Verify returns to list view
4. Click "Add New Bank"
5. Click "All Banks" in breadcrumb
6. Verify returns to list view

**Expected Result:**
- ✅ Breadcrumb navigation works correctly
- ✅ No data loss when navigating
- ✅ View state changes properly

---

### **Test 7: Cancel & Reset**

**Steps:**
1. Click "AXIS BANK" → "Edit"
2. Change "Transaction ID" to "MODIFIED"
3. Click "Cancel"

**Expected Result:**
- ✅ Changes reverted
- ✅ Original value restored
- ✅ Edit mode exits

---

### **Test 8: Validation & Error Handling**

**Steps:**
1. Try to create bank with empty required fields
2. Try to edit bank with invalid API response
3. Try to delete non-existent bank

**Expected Result:**
- ✅ Create button disabled if required fields empty
- ✅ Error message displays on API failure
- ✅ Graceful error handling

---

## 🎯 Critical Path Test (Quick)

### Run these tests in sequence:

```bash
# 1. List all banks
curl -s http://localhost:5103/bank-mappings | jq '{count: .count, banks: (.mappings | map(.bank_name) | .[0:3])}'

# 2. Get HDFC mapping
curl -s http://localhost:5103/bank-mappings/HDFC%20BANK | jq '.mapping.v1_column_mappings'

# 3. Update AXIS (change PRNNo → TXN_REF)
curl -X PUT http://localhost:5103/bank-mappings/AXIS%20BANK \
  -H "Content-Type: application/json" \
  -d '{"v1_column_mappings": {"transaction_id": "TXN_REF", "paid_amount": "Amount", "payee_amount": "Amount", "transaction_date_time": "Date", "payment_date_time": "Date"}}' | jq '.success'

# 4. Verify update
curl -s http://localhost:5103/bank-mappings/AXIS%20BANK | jq '.mapping.v1_column_mappings.transaction_id'

# 5. Rollback (change back to PRNNo)
curl -X PUT http://localhost:5103/bank-mappings/AXIS%20BANK \
  -H "Content-Type: application/json" \
  -d '{"v1_column_mappings": {"transaction_id": "PRNNo", "paid_amount": "Amount", "payee_amount": "Amount", "transaction_date_time": "Date", "payment_date_time": "Date"}}' | jq '.success'

# 6. Create test bank
curl -X POST http://localhost:5103/bank-mappings \
  -H "Content-Type: application/json" \
  -d '{"config_name": "TEST BANK", "bank_name": "Test Bank", "file_type": "csv", "v1_column_mappings": {"transaction_id": "ID", "paid_amount": "AMOUNT", "payee_amount": "AMOUNT", "transaction_date_time": "DATE"}}' | jq '.success'

# 7. Delete test bank
curl -X DELETE http://localhost:5103/bank-mappings/TEST%20BANK | jq '.success'

# 8. Final count check
curl -s http://localhost:5103/bank-mappings | jq '.count'
# Should be 21
```

---

## ✅ Expected Final State

After all tests:
- ✅ 21 banks configured
- ✅ HDFC, AXIS, SBI mappings intact
- ✅ All CRUD operations working
- ✅ UI responsive and intuitive
- ✅ API integration solid

---

## 🚀 Next: End-to-End Upload Test

Upload an actual HDFC bank file and verify:
1. Filename detection works
2. Two-stage normalization applied
3. V1 mappings fetched from database
4. V2 conversion happens automatically
5. Reconciliation uses V2 data

**Test File:** `HDFC_BANK_20251003.csv`

---

**Status:** Ready for UI Testing  
**URL:** http://localhost:5174/ops/workspace  
**Component:** Recon Workspace → Settings Icon → Recon Config
