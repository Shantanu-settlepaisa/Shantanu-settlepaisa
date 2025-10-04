# 🔄 V1 to V2 Normalization Mappings - Complete Reference

**Source:** `services/recon-api/utils/v1-column-mapper.js`  
**Purpose:** Normalize V1 format files to V2 standard schema  
**Date:** October 3, 2025

---

## 📊 **Table of Contents**

1. [PG Transaction Mappings](#pg-transaction-mappings)
2. [Bank Statement Mappings](#bank-statement-mappings)
3. [Data Type Transformations](#data-type-transformations)
4. [Complete Examples](#complete-examples)

---

## 1️⃣ **PG Transaction Mappings**

### **V1 → V2 Column Mapping:**

| V1 Column | V2 Column | Data Type | Transformation | Notes |
|-----------|-----------|-----------|----------------|-------|
| `transaction_id` | `transaction_id` | String | Direct copy | Unique identifier |
| `client_code` | `merchant_id` | String | **UPPERCASE** | Client → Merchant |
| `payee_amount` | `amount_paise` | Integer | **× 100** | Rupees → Paise |
| `paid_amount` | `amount_paise` | Integer | **× 100** | Rupees → Paise |
| `bank_exclude_amount` | `bank_fee_paise` | Integer | **× 100** | Bank fee in paise |
| `settlement_amount` | `settlement_amount_paise` | Integer | **× 100** | Settlement in paise |
| `settled_amount_by_bank` | `settlement_amount_paise` | Integer | **× 100** | Settled amount in paise |
| `payment_mode` | `payment_method` | String | Direct copy | UPI, CARD, NB, etc. |
| `trans_complete_date` | `transaction_timestamp` | ISO 8601 | **Date parse** | Timestamp format |
| `trans_date` | `transaction_date` | ISO 8601 | **Date parse** | Date format |
| `bank_name` | `bank_name` | String | Direct copy | Bank identifier |
| `utr` | `utr` | String | Direct copy | Unique Transaction Ref |
| `rrn` | `rrn` | String | Direct copy | Retrieval Reference Number |
| `approval_code` | `approval_code` | String | Direct copy | Approval code |
| `transaction_status` | `status` | String | Direct copy | SUCCESS, FAILED, etc. |
| `pg_name` | `source_name` | String | Direct copy | Payment gateway name |
| `pg_pay_mode` | `payment_method` | String | Direct copy | Payment method |
| (none) | `source_type` | String | **Default: 'manual_upload'** | Auto-added |
| (none) | `currency` | String | **Default: 'INR'** | Auto-added |

---

### **V1 PG Transaction Schema:**

```javascript
{
  transaction_id: "TXN123456",           // String
  client_code: "merch001",               // String (lowercase)
  payee_amount: "1000.50",               // String/Number (Rupees)
  paid_amount: "1000.50",                // String/Number (Rupees)
  bank_exclude_amount: "20.00",          // String/Number (Rupees)
  settlement_amount: "980.50",           // String/Number (Rupees)
  settled_amount_by_bank: "980.50",      // String/Number (Rupees)
  payment_mode: "UPI",                   // String
  trans_complete_date: "2025-10-02 14:30:00", // String (DateTime)
  trans_date: "2025-10-02",              // String (Date)
  bank_name: "HDFC",                     // String
  utr: "UTR123456789",                   // String
  rrn: "RRN987654321",                   // String
  approval_code: "APPR123",              // String
  transaction_status: "SUCCESS",         // String
  pg_name: "Razorpay",                   // String
  pg_pay_mode: "UPI"                     // String
}
```

---

### **V2 PG Transaction Schema:**

```javascript
{
  transaction_id: "TXN123456",           // String (same)
  merchant_id: "MERCH001",               // String (UPPERCASE)
  amount_paise: 100050,                  // Integer (1000.50 × 100)
  bank_fee_paise: 2000,                  // Integer (20.00 × 100)
  settlement_amount_paise: 98050,        // Integer (980.50 × 100)
  payment_method: "UPI",                 // String
  transaction_timestamp: "2025-10-02T09:00:00.000Z", // ISO 8601
  transaction_date: "2025-10-02T00:00:00.000Z",      // ISO 8601
  bank_name: "HDFC",                     // String (same)
  utr: "UTR123456789",                   // String (same)
  rrn: "RRN987654321",                   // String (same)
  approval_code: "APPR123",              // String (same)
  status: "SUCCESS",                     // String
  source_name: "Razorpay",               // String
  source_type: "manual_upload",          // String (auto-added)
  currency: "INR"                        // String (auto-added)
}
```

---

## 2️⃣ **Bank Statement Mappings**

### **V1 → V2 Column Mapping:**

| V1 Column | V2 Column | Data Type | Transformation | Notes |
|-----------|-----------|-----------|----------------|-------|
| `utr` | `utr` | String | Direct copy | Unique Transaction Ref |
| `rrn` | `rrn` | String | Direct copy | Retrieval Reference Number |
| `paid_amount` | `amount_paise` | Integer | **× 100** | Rupees → Paise |
| `payee_amount` | `amount_paise` | Integer | **× 100** | Rupees → Paise |
| `trans_complete_date` | `transaction_date` | ISO 8601 | **Date parse** | Transaction timestamp |
| `trans_date` | `transaction_date` | ISO 8601 | **Date parse** | Transaction date |
| `bank_name` | `bank_name` | String | Direct copy | Bank identifier |
| `transaction_status` | `status` | String | Direct copy | Transaction status |
| `approval_code` | `approval_code` | String | Direct copy | Approval code |

---

### **V1 Bank Statement Schema:**

```javascript
{
  utr: "UTR123456789",                   // String
  rrn: "RRN987654321",                   // String (optional)
  paid_amount: "980.50",                 // String/Number (Rupees)
  payee_amount: "980.50",                // String/Number (Rupees)
  trans_complete_date: "2025-10-02 14:35:00", // String (DateTime)
  trans_date: "2025-10-02",              // String (Date)
  bank_name: "HDFC",                     // String
  transaction_status: "SETTLED",         // String
  approval_code: "APPR123"               // String (optional)
}
```

---

### **V2 Bank Statement Schema:**

```javascript
{
  utr: "UTR123456789",                   // String (same)
  rrn: "RRN987654321",                   // String (same)
  amount_paise: 98050,                   // Integer (980.50 × 100)
  transaction_date: "2025-10-02T09:05:00.000Z", // ISO 8601
  bank_name: "HDFC",                     // String (same)
  status: "SETTLED",                     // String
  approval_code: "APPR123"               // String (same)
}
```

---

## 3️⃣ **Data Type Transformations**

### **A. Amount Conversion (Rupees → Paise)**

**Code:** Lines 81-98

```javascript
// For amount_paise field
if (v2Col === 'amount_paise') {
  if (typeof value === 'string') {
    const numValue = parseFloat(value.replace(/,/g, ''));
    value = Math.round(numValue * 100);  // × 100
  } else if (typeof value === 'number') {
    value = Math.round(value * 100);     // × 100
  }
}

// For fee and settlement fields (V2.10.0)
if (v2Col === 'bank_fee_paise' || v2Col === 'settlement_amount_paise') {
  if (typeof value === 'string') {
    const numValue = parseFloat(value.replace(/,/g, ''));
    value = Math.round(numValue * 100);  // × 100
  } else if (typeof value === 'number') {
    value = Math.round(value * 100);     // × 100
  }
}
```

**Examples:**

| V1 Input | Type | V2 Output | Calculation |
|----------|------|-----------|-------------|
| `"2500.50"` | String | `250050` | 2500.50 × 100 |
| `1750.75` | Number | `175075` | 1750.75 × 100 |
| `"1,000.25"` | String (comma) | `100025` | 1000.25 × 100 (comma removed) |
| `500` | Number | `50000` | 500 × 100 |
| `"0.50"` | String | `50` | 0.50 × 100 |

---

### **B. Merchant ID (Uppercase Conversion)**

**Code:** Lines 100-102

```javascript
if (v2Col === 'merchant_id') {
  value = String(value).trim().toUpperCase();
}
```

**Examples:**

| V1 Input | V2 Output |
|----------|-----------|
| `"merch001"` | `"MERCH001"` |
| `"TestMerchant123"` | `"TESTMERCHANT123"` |
| `"  client_abc  "` | `"CLIENT_ABC"` |

---

### **C. Date Conversion (ISO 8601)**

**Code:** Lines 104-108

```javascript
if (v2Col === 'transaction_timestamp' || v2Col === 'transaction_date') {
  if (typeof value === 'string' && value.trim()) {
    value = new Date(value).toISOString();
  }
}
```

**Examples:**

| V1 Input | V2 Output |
|----------|-----------|
| `"2025-10-02 14:30:00"` | `"2025-10-02T09:00:00.000Z"` |
| `"2025-10-02"` | `"2025-10-02T00:00:00.000Z"` |
| `"10/02/2025"` | `"2025-10-02T00:00:00.000Z"` |

---

### **D. Default Values (Auto-added)**

**Code:** Lines 114-130

```javascript
// For PG Transactions only
if (type === 'pg_transactions') {
  if (!v2Row.source_type) {
    v2Row.source_type = 'manual_upload';  // Default
  }
  
  if (!v2Row.currency) {
    v2Row.currency = 'INR';               // Default
  }
}
```

**Fields Auto-Added:**

| Field | Default Value | Applied To |
|-------|---------------|------------|
| `source_type` | `"manual_upload"` | PG Transactions only |
| `currency` | `"INR"` | PG Transactions only |

---

## 4️⃣ **Complete Examples**

### **Example 1: PG Transaction (Full Conversion)**

**V1 Input:**
```javascript
{
  transaction_id: "TXN123456",
  client_code: "merch001",
  payee_amount: "1000.50",
  paid_amount: "1000.50",
  bank_exclude_amount: "20.00",
  settlement_amount: "980.50",
  payment_mode: "UPI",
  trans_complete_date: "2025-10-02 14:30:00",
  trans_date: "2025-10-02",
  bank_name: "HDFC",
  utr: "UTR123456789",
  rrn: "RRN987654321",
  approval_code: "APPR123",
  transaction_status: "SUCCESS",
  pg_name: "Razorpay"
}
```

**V2 Output:**
```javascript
{
  transaction_id: "TXN123456",           // ✅ Same
  merchant_id: "MERCH001",               // ✅ UPPERCASE
  amount_paise: 100050,                  // ✅ 1000.50 × 100
  bank_fee_paise: 2000,                  // ✅ 20.00 × 100
  settlement_amount_paise: 98050,        // ✅ 980.50 × 100
  payment_method: "UPI",                 // ✅ Same
  transaction_timestamp: "2025-10-02T09:00:00.000Z", // ✅ ISO 8601
  transaction_date: "2025-10-02T00:00:00.000Z",      // ✅ ISO 8601
  bank_name: "HDFC",                     // ✅ Same
  utr: "UTR123456789",                   // ✅ Same
  rrn: "RRN987654321",                   // ✅ Same
  approval_code: "APPR123",              // ✅ Same
  status: "SUCCESS",                     // ✅ Same
  source_name: "Razorpay",               // ✅ Same
  source_type: "manual_upload",          // ✅ Auto-added
  currency: "INR"                        // ✅ Auto-added
}
```

---

### **Example 2: Bank Statement (Full Conversion)**

**V1 Input:**
```javascript
{
  utr: "UTR123456789",
  rrn: "RRN987654321",
  paid_amount: "980.50",
  trans_complete_date: "2025-10-02 14:35:00",
  trans_date: "2025-10-02",
  bank_name: "HDFC",
  transaction_status: "SETTLED",
  approval_code: "APPR123"
}
```

**V2 Output:**
```javascript
{
  utr: "UTR123456789",                   // ✅ Same
  rrn: "RRN987654321",                   // ✅ Same
  amount_paise: 98050,                   // ✅ 980.50 × 100
  transaction_date: "2025-10-02T09:05:00.000Z", // ✅ ISO 8601
  bank_name: "HDFC",                     // ✅ Same
  status: "SETTLED",                     // ✅ Same
  approval_code: "APPR123"               // ✅ Same
}
```

---

### **Example 3: Edge Cases**

**V1 Input (Empty/Null Values):**
```javascript
{
  transaction_id: "TXN999",
  client_code: "merch999",
  payee_amount: "",           // Empty string
  paid_amount: null,          // Null
  bank_exclude_amount: undefined, // Undefined
  utr: "UTR999",
  trans_date: "2025-10-02"
}
```

**V2 Output:**
```javascript
{
  transaction_id: "TXN999",              // ✅ Preserved
  merchant_id: "MERCH999",               // ✅ UPPERCASE
  transaction_date: "2025-10-02T00:00:00.000Z", // ✅ ISO 8601
  utr: "UTR999",                         // ✅ Preserved
  source_type: "manual_upload",          // ✅ Auto-added
  currency: "INR"                        // ✅ Auto-added
  // Note: amount_paise NOT added (empty/null skipped)
}
```

---

## 5️⃣ **Format Detection**

**Code:** Lines 34-67

### **V1 Format Indicators:**
- `client_code`
- `payee_amount`
- `paid_amount`
- `trans_complete_date`
- `pg_name`

### **V2 Format Indicators:**
- `pg_txn_id`
- `merchant_id`
- `amount_paise`
- `payment_method`

**Logic:**
```javascript
if (v1Score > v2Score) → "v1" → Convert
if (v2Score > v1Score) → "v2" → No conversion (pass through)
if (v1Score === v2Score) → "unknown" → Attempt conversion anyway
```

---

## 6️⃣ **Usage in Code**

### **Import:**
```javascript
const { convertV1CSVToV2 } = require('./v1-column-mapper');
```

### **Convert PG Transactions:**
```javascript
const v1PgData = [
  { transaction_id: "TXN001", client_code: "merch001", payee_amount: "1000.50", ... },
  { transaction_id: "TXN002", client_code: "merch002", payee_amount: "2000.75", ... }
];

const v2PgData = convertV1CSVToV2(v1PgData, 'pg_transactions');
// Result: [{ transaction_id: "TXN001", merchant_id: "MERCH001", amount_paise: 100050, ... }, ...]
```

### **Convert Bank Statements:**
```javascript
const v1BankData = [
  { utr: "UTR001", paid_amount: "500.00", trans_date: "2025-10-02", ... },
  { utr: "UTR002", paid_amount: "750.50", trans_date: "2025-10-02", ... }
];

const v2BankData = convertV1CSVToV2(v1BankData, 'bank_statements');
// Result: [{ utr: "UTR001", amount_paise: 50000, transaction_date: "...", ... }, ...]
```

---

## 7️⃣ **Summary Table**

### **Key Transformations:**

| Transformation | V1 Format | V2 Format | Example |
|----------------|-----------|-----------|---------|
| **Amount** | Rupees (decimal) | Paise (integer) | 1000.50 → 100050 |
| **Merchant ID** | Lowercase | UPPERCASE | "merch001" → "MERCH001" |
| **Dates** | Various formats | ISO 8601 | "2025-10-02" → "2025-10-02T00:00:00.000Z" |
| **Source Type** | (none) | Auto-added | → "manual_upload" |
| **Currency** | (none) | Auto-added | → "INR" |

### **Field Mappings:**

| Category | V1 → V2 Mappings |
|----------|------------------|
| **PG Transactions** | 18 fields mapped |
| **Bank Statements** | 9 fields mapped |
| **Auto-added** | 2 fields (source_type, currency) |
| **Transformations** | 4 types (amount, merchant_id, dates, defaults) |

---

## ✅ **Status**

**File:** `services/recon-api/utils/v1-column-mapper.js`  
**Lines:** 169 total  
**Functions:** 3 (detectFormat, mapV1ToV2, convertV1CSVToV2)  
**Status:** ✅ Production-ready  
**Version:** V2.10.0 (includes fee columns)

---

**Last Updated:** October 3, 2025  
**Maintainer:** Recon API Team
