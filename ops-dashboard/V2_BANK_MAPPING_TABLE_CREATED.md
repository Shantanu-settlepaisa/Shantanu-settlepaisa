# ✅ V2 Bank Mapping Table Created & Seeded

**Date:** October 3, 2025  
**Status:** ✅ COMPLETED  
**Database:** settlepaisa_v2  
**Table:** `sp_v2_bank_column_mappings`

---

## 📊 **What Was Created:**

### **1. Table Structure:**

```sql
CREATE TABLE sp_v2_bank_column_mappings (
    id UUID PRIMARY KEY,
    
    -- Bank identification
    config_name VARCHAR(100) UNIQUE,      -- "HDFC BANK", "AXIS BANK"
    bank_name VARCHAR(100),               -- Bank display name
    
    -- File format
    file_type VARCHAR(10),                -- xlsx, csv, txt
    delimiter VARCHAR(10),                -- ~, |, etc.
    encoding VARCHAR(20),
    has_header BOOLEAN,
    
    -- V1-Compatible Mappings (JSONB)
    v1_column_mappings JSONB NOT NULL,    -- Bank columns → V1 standard
    
    -- Additional settings
    date_format VARCHAR(50),
    amount_format VARCHAR(20),
    special_fields JSONB,                 -- e.g., on-us indicator
    
    -- Status
    is_active BOOLEAN,
    source VARCHAR(20),                   -- V1_MIGRATED, MANUAL, API
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP
);
```

---

## 🎯 **Data Migrated:**

### **Total Banks:** 21 configurations

| Config Name | Bank Name | File Type | Delimiter | Status |
|-------------|-----------|-----------|-----------|--------|
| AIRTEL UPI | AIRTEL UPI | xlsx | - | ✅ |
| AMAZON | AMAZON | xlsx | - | ✅ |
| ATOM | ATOM | xlsx | - | ✅ |
| **AXIS BANK** | **AXIS BANK** | **txt** | **~** | ✅ |
| BOB | BOB | xlsx | - | ✅ |
| BOI | BOI | xlsx | - | ✅ |
| CANARA | CANARA BANK | txt | - | ✅ |
| CENTRAL | CENTRAL | xlsx | - | ✅ |
| FEDERL | FEDERAL | xlsx | - | ✅ |
| **HDFC BANK** | **HDFC BANK** | **xlsx** | - | ✅ |
| HDFC NB | HDFC NB | xlsx | - | ✅ |
| HDFC UPI | HDFC UPI | xlsx | - | ✅ |
| IDBI | IDBI | xlsx | - | ✅ |
| INDIAN BANK | INDIAN BANK | xlsx | - | ✅ |
| INDIAN UPI | INDIAN UPI | xlsx | - | ✅ |
| INGENICO | INGENICO | xlsx | - | ✅ |
| MAHARASTRA | MAHARASTRA | xlsx | - | ✅ |
| MOBIKWIK | MOBIKWIK | xlsx | - | ✅ |
| **SBI BANK** | **SBI BANK** | **xlsx** | - | ✅ |
| SBI NB | SBI NB | xlsx | - | ✅ |
| YES BANK | YES BANK | xlsx | - | ✅ |

---

## 🔍 **Sample Data (HDFC BANK):**

```sql
SELECT * FROM sp_v2_bank_column_mappings WHERE config_name = 'HDFC BANK';
```

**Result:**
```json
{
  "config_name": "HDFC BANK",
  "bank_name": "HDFC BANK",
  "file_type": "xlsx",
  "delimiter": null,
  "v1_column_mappings": {
    "transaction_id": "MERCHANT_TRACKID",
    "paid_amount": "DOMESTIC AMT",
    "payee_amount": "Net Amount",
    "transaction_date_time": "TRANS DATE",
    "payment_date_time": "SETTLE DATE"
  },
  "is_active": true,
  "source": "V1_MIGRATED"
}
```

---

## 🔄 **How This Works:**

### **Upload Flow:**

```
1. User uploads HDFC bank file
   ↓
2. Detect bank from filename → "HDFC BANK"
   ↓
3. Query: SELECT v1_column_mappings 
          FROM sp_v2_bank_column_mappings 
          WHERE config_name = 'HDFC BANK'
   ↓
4. Apply V1 mapping (Bank → V1 Standard)
   Raw: {MERCHANT_TRACKID: "UTR123", "DOMESTIC AMT": "2500.50"}
   V1: {transaction_id: "UTR123", paid_amount: 2500.50}
   ↓
5. Convert V1 → V2 (using v1-column-mapper.js)
   V2: {utr: "UTR123", amount_paise: 250050}
   ↓
6. Save to sp_v2_bank_statements
```

---

## 📝 **V1 Column Mappings (Standard Schema):**

All banks map TO these V1 standard columns:

```javascript
{
  transaction_id: "...",        // Unique transaction reference
  paid_amount: "...",          // Gross amount (decimal)
  payee_amount: "...",         // Net amount (decimal)
  transaction_date_time: "...", // Transaction date
  payment_date_time: "..."     // Settlement date
}
```

Then V1 → V2 mapper converts:
- `transaction_id` → `utr`
- `paid_amount` (rupees) → `amount_paise` (× 100)
- `transaction_date_time` → `transaction_date` (ISO)

---

## 🎯 **Key Features:**

### **1. Two-Stage Mapping:**
```
Bank File → [V1 Mapping] → V1 Standard → [V1-V2 Mapper] → V2 Standard
```

### **2. Reuses V1 Logic:**
- ✅ V1 column mappings stored in JSONB
- ✅ Existing `v1-column-mapper.js` handles V1→V2
- ✅ No duplicate code

### **3. Flexible:**
- ✅ Supports multiple file types (xlsx, csv, txt)
- ✅ Custom delimiters (~, |, etc.)
- ✅ Special fields (on-us indicators)

### **4. Extensible:**
- ✅ Easy to add new banks via INSERT
- ✅ Can be managed via API (future)
- ✅ Audit trail (created_by, updated_by)

---

## 🚀 **Next Steps:**

### **1. Create API Endpoints (Optional):**
```javascript
GET    /api/bank-mappings              // List all
GET    /api/bank-mappings/:name        // Get one
POST   /api/bank-mappings              // Create
PUT    /api/bank-mappings/:name        // Update
DELETE /api/bank-mappings/:name        // Delete
```

### **2. Integrate with Upload Flow:**
```javascript
// In bank file upload handler
async function uploadBankFile(file) {
  const bankName = detectBankFromFilename(file.name);
  const mapping = await fetchBankMapping(bankName);
  const v1Data = applyBankToV1Mapping(file, mapping);
  const v2Data = convertV1ToV2(v1Data);
  await saveBankStatements(v2Data);
}
```

### **3. Add UI Management (Optional):**
- ReconConfigDrawer component
- CRUD operations for bank mappings
- Preview/test mapping feature

---

## ✅ **Verification:**

### **Check table exists:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'sp_v2_bank_column_mappings';
-- Result: ✅ 1 row
```

### **Count records:**
```sql
SELECT COUNT(*) FROM sp_v2_bank_column_mappings;
-- Result: ✅ 21 banks
```

### **List all banks:**
```sql
SELECT config_name FROM sp_v2_bank_column_mappings ORDER BY config_name;
-- Result: ✅ All 21 banks listed
```

### **Check HDFC mapping:**
```sql
SELECT v1_column_mappings 
FROM sp_v2_bank_column_mappings 
WHERE config_name = 'HDFC BANK';
-- Result: ✅ Correct JSONB mapping
```

---

## 📊 **Migration Details:**

**File:** `/db/migrations/015_create_bank_column_mappings.sql`  
**Executed:** October 3, 2025  
**Database:** settlepaisa_v2  
**Status:** ✅ SUCCESS

**Output:**
```
CREATE TABLE
CREATE INDEX (3)
COMMENT (4)
INSERT 0 21
NOTICE: Migration 015 completed
NOTICE: Inserted 21 bank configurations from V1 recon_configs
```

---

## 🎉 **Summary:**

✅ **Table Created:** `sp_v2_bank_column_mappings`  
✅ **Data Migrated:** 21 banks from V1 production  
✅ **Key Banks:** HDFC, AXIS, SBI, BOB, CANARA, YES, and 15 more  
✅ **Format:** V1-compatible JSONB mappings  
✅ **Ready for:** Two-stage normalization (Bank → V1 → V2)  

**Next:** Integrate with bank file upload flow! 🚀
