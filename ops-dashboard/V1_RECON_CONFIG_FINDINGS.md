# 📊 V1 Recon Config System - Complete Analysis

**Analysis Date:** October 3, 2025  
**Source:** SettlePaisa V1 Java Service (`/settlepaisa/services/recon-service`)

---

## 🎯 Executive Summary

✅ **FOUND:** V1 has a **complete bank mapping configuration system** with:
- Database table: `recon_mapping_template`
- RESTful API endpoints
- Column mapping + data transforms
- Per-acquirer/bank configuration
- Filename-based bank detection

---

## 📋 V1 Database Schema

### **Table: `recon_mapping_template`**

```sql
CREATE TABLE recon_mapping_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acquirer VARCHAR(50) NOT NULL,              -- Bank code (HDFC, AXIS, ICICI, etc.)
    file_type VARCHAR(50) NOT NULL,              -- File type (RECON, SETTLEMENT, etc.)
    version INTEGER NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- File parsing config
    delimiter VARCHAR(5) DEFAULT ',',
    header_rows INTEGER DEFAULT 1,
    date_format VARCHAR(50) DEFAULT 'yyyy-MM-dd',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    number_locale VARCHAR(10) DEFAULT 'en_IN',
    
    -- Core mapping configuration
    column_mappings JSONB NOT NULL,              -- Source → Target column mapping
    transforms JSONB,                            -- Data transformation rules
    
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: One mapping per acquirer/file_type/version
CREATE UNIQUE INDEX idx_mapping_template_version 
ON recon_mapping_template(acquirer, file_type, version);

-- Ensure only one default template per acquirer/file_type
CREATE UNIQUE INDEX idx_mapping_template_single_default 
ON recon_mapping_template(acquirer, file_type) 
WHERE is_default = TRUE;
```

---

## 🗂️ Column Mapping Structure (JSONB)

### **Format:**
```json
{
  "field_key": {
    "sourceColumn": "txn_id",           // Bank's column name
    "targetColumn": "utr",              // Standard column name
    "dataType": "STRING",               // Data type
    "required": true                    // Is required?
  }
}
```

### **Example - HDFC Bank Mapping:**
```json
{
  "utr": {
    "sourceColumn": "txn_id",
    "targetColumn": "utr",
    "dataType": "STRING",
    "required": true
  },
  "amount": {
    "sourceColumn": "credit_amt",
    "targetColumn": "amount_paise",
    "dataType": "MONEY",
    "required": true
  },
  "transaction_date": {
    "sourceColumn": "txn_date",
    "targetColumn": "transaction_date",
    "dataType": "DATE",
    "required": true
  },
  "bank_ref": {
    "sourceColumn": "ref_no",
    "targetColumn": "bank_ref",
    "dataType": "STRING",
    "required": false
  }
}
```

### **Example - AXIS Bank Mapping:**
```json
{
  "utr": {
    "sourceColumn": "id",              // Different column name
    "targetColumn": "utr",
    "dataType": "STRING",
    "required": true
  },
  "amount": {
    "sourceColumn": "amount",          // Different column name
    "targetColumn": "amount_paise",
    "dataType": "MONEY",
    "required": true
  },
  "transaction_date": {
    "sourceColumn": "date",            // Different column name
    "targetColumn": "transaction_date",
    "dataType": "DATE",
    "required": true
  }
}
```

---

## 🔄 Transform Rules (JSONB)

### **Format:**
```json
[
  {
    "type": "MONEY_RUPEES_TO_PAISE",
    "field": "amount_paise",
    "params": {
      "sourceField": "credit_amt",
      "locale": "en_IN"
    }
  },
  {
    "type": "DATE_PARSE",
    "field": "transaction_date",
    "params": {
      "sourceField": "txn_date",
      "format": "dd-MM-yyyy",
      "timezone": "Asia/Kolkata"
    }
  },
  {
    "type": "STRING_UPPER",
    "field": "utr",
    "params": {
      "sourceField": "txn_id"
    }
  }
]
```

### **Available Transform Types:**
- `MONEY_RUPEES_TO_PAISE` - Convert rupees to paise
- `DATE_PARSE` - Parse date with custom format
- `STRING_UPPER` / `STRING_LOWER` - Case conversion
- `REGEX_EXTRACT` - Extract using regex
- `CONCAT` - Concatenate fields
- `DEFAULT_VALUE` - Set default if null

---

## 🏦 Bank Detection Logic

### **V1 Approach:**

**1. Filename Pattern Detection:**
```
HDFC_NEFT_20251002.txt    → acquirer = HDFC
AXIS_RTGS_20251002.xml    → acquirer = AXIS
ICICI_NEFT_20251002.csv   → acquirer = ICICI
SBI_IMPS_20251002.csv     → acquirer = SBI
```

**Pattern:** `{ACQUIRER}_{RAIL}_{DATE}.{ext}`

**2. API Parameter (Explicit):**
```java
POST /v1/recon/files/upload
{
  "file": <multipart>,
  "acquirer": "HDFC",      // Explicitly provided
  "fileType": "RECON"
}
```

**3. Column Header Detection (Fallback):**
If filename doesn't match pattern:
- Check for unique column combinations
- HDFC: has `txn_id` + `credit_amt` + `ref_no`
- AXIS: has `id` + `amount` + `date`
- ICICI: has `transaction_ref` + `credit_amount`

---

## 🔌 V1 API Endpoints

### **1. Create Mapping Template**
```
POST /v1/recon/mappings
Headers:
  X-User-Id: user123
  X-Idempotency-Key: unique-key
Body:
{
  "acquirer": "HDFC",
  "fileType": "RECON",
  "version": 1,
  "isDefault": true,
  "delimiter": ",",
  "headerRows": 1,
  "dateFormat": "dd-MM-yyyy",
  "columnMappings": { ... },
  "transforms": [ ... ]
}
```

### **2. Get Mapping Template**
```
GET /v1/recon/mappings?acquirer=HDFC&fileType=RECON
```

### **3. Preview Normalization**
```
POST /v1/recon/mappings/preview
Form Data:
  file: <multipart>
  template: <template-json>
Response:
{
  "rows": [
    {
      "lineNo": 1,
      "utr": "HDFC123",
      "amountPaise": 100000,
      "txnAt": "2025-10-02T10:30:00Z",
      "warnings": []
    }
  ],
  "totalRows": 100,
  "successRows": 98,
  "errorRows": 2
}
```

### **4. Set as Default**
```
POST /v1/recon/mappings/{id}/set-default
```

---

## 📂 V1 Standard Target Columns

After normalization, V1 outputs these standard fields:

```javascript
{
  utr: 'string',               // Unique Transaction Reference
  rrn: 'string',               // Retrieval Reference Number (optional)
  amount_paise: number,        // Amount in paise
  currency: 'INR',             // Currency code
  transaction_date: 'ISO8601', // Transaction timestamp
  merchant_ref: 'string',      // Merchant reference
  acquirer_ref: 'string',      // Bank/acquirer reference
  status_code: 'string',       // Transaction status
  auth_code: 'string',         // Authorization code (optional)
  bank_name: 'string',         // Bank name
  debit_credit: 'CREDIT|DEBIT' // Transaction type
}
```

---

## 🏗️ V1 Normalization Flow

```
1. File Upload
   ↓
2. Detect Acquirer (filename pattern or API param)
   ↓
3. Fetch mapping template (acquirer + fileType + is_default=true)
   ↓
4. Parse CSV/Excel with config (delimiter, headerRows)
   ↓
5. Apply column mappings (source → target)
   ↓
6. Apply transforms (money, date, string, etc.)
   ↓
7. Validate required fields
   ↓
8. Save to recon_row_norm table (normalized data)
   ↓
9. Ready for reconciliation matching
```

---

## 📊 Sample Bank Configurations

### **Known Banks in V1:**
From seed data and migrations:

| Bank Code | File Pattern | Auth Method | Delimiter | Date Format |
|-----------|--------------|-------------|-----------|-------------|
| HDFC      | HDFC_NEFT_* | TOKEN       | ,         | dd-MM-yyyy  |
| AXIS      | AXIS_RTGS_* | API_KEY     | ,         | yyyy-MM-dd  |
| ICICI     | ICICI_NEFT_* | OAUTH      | ,         | dd/MM/yyyy  |
| SBI       | SBI_IMPS_*  | API_KEY     | \|        | dd-MM-yyyy  |
| BOB       | BOB_NEFT_*  | TOKEN       | ,         | yyyy-MM-dd  |

---

## 🔑 Key Takeaways for V2

1. **Table Structure:** ✅ V1 has robust schema, can clone to V2
2. **Bank Detection:** ✅ Filename pattern works (HDFC_NEFT_20251002.txt)
3. **Column Mapping:** ✅ JSONB structure flexible and proven
4. **Transforms:** ✅ Transform pipeline handles conversions
5. **API Design:** ✅ RESTful, well-documented endpoints
6. **Versioning:** ✅ Supports multiple versions per bank
7. **Default Flag:** ✅ One default template per bank/type

---

## 🚀 V2 Migration Strategy

### **Step 1: Clone Table Structure**
```sql
CREATE TABLE sp_v2_bank_column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acquirer_code VARCHAR(50) NOT NULL,        -- HDFC, AXIS, etc.
    file_type VARCHAR(50) NOT NULL,            -- RECON, SETTLEMENT
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- File parsing config
    delimiter VARCHAR(5) DEFAULT ',',
    header_rows INTEGER DEFAULT 1,
    date_format VARCHAR(50) DEFAULT 'yyyy-MM-dd',
    
    -- Core mapping (JSONB)
    column_mappings JSONB NOT NULL,
    transforms JSONB,
    
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Step 2: Seed Initial Mappings**
Copy existing V1 mappings for:
- HDFC
- AXIS
- ICICI
- SBI
- BOB

### **Step 3: Create API Endpoints**
```
POST   /api/v2/bank-mappings          # Create
GET    /api/v2/bank-mappings          # List
GET    /api/v2/bank-mappings/:id      # Get one
PUT    /api/v2/bank-mappings/:id      # Update
POST   /api/v2/bank-mappings/preview  # Preview
```

### **Step 4: Integrate with Upload Flow**
```javascript
// In ManualUploadEnhanced.tsx or upload API
async function uploadBankFile(file) {
  // 1. Detect bank from filename
  const acquirer = detectAcquirerFromFilename(file.name);
  
  // 2. Fetch mapping config
  const mapping = await fetchBankMapping(acquirer, 'RECON');
  
  // 3. Parse and normalize
  const normalized = applyBankMapping(csvData, mapping);
  
  // 4. Convert to V2 standard format
  const v2Data = convertToV2BankFormat(normalized);
  
  // 5. Ready for reconciliation
  return v2Data;
}
```

---

## 📝 Next Steps

1. ✅ V1 system analyzed - fully documented
2. ⏳ Create V2 table `sp_v2_bank_column_mappings`
3. ⏳ Seed with V1 bank mappings (if available in DB)
4. ⏳ Build V2 API endpoints (Node.js/Express)
5. ⏳ Integrate with ManualUploadEnhanced component
6. ⏳ Add bank detection logic (filename pattern)
7. ⏳ Test with HDFC, AXIS, ICICI files

---

**Status:** ✅ V1 Analysis Complete - Ready to build V2 system
