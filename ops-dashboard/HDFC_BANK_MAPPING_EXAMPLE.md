# 🏦 HDFC Bank File Mapping - V1 System

**Example Date:** October 3, 2025

---

## 📂 HDFC Bank File Format (Raw CSV)

### **Sample File: `HDFC_NEFT_20240115.csv`**

```csv
bank_ref,txn_date,amount,credit_debit,description,merchant_ref,settlement_date,utr
HDFC001,2024-01-15,2500.00,CR,"UPI TXN RZP_TXN_001",ORDER_001,2024-01-16,UTR001234567
HDFC002,2024-01-15,1750.00,CR,"NETBANK TXN PAYU_TXN_002",ORDER_002,2024-01-16,UTR001234568
HDFC003,2024-01-15,3000.00,CR,"CARD TXN CCA_TXN_003",ORDER_003,2024-01-16,UTR001234569
```

### **HDFC Columns:**
| Column Name | Data Type | Description | Example |
|-------------|-----------|-------------|---------|
| `bank_ref` | String | HDFC's internal reference | HDFC001 |
| `txn_date` | Date | Transaction date | 2024-01-15 |
| `amount` | Decimal (Rupees) | Transaction amount in ₹ | 2500.00 |
| `credit_debit` | String | CR/DR indicator | CR |
| `description` | String | Transaction description | "UPI TXN RZP_TXN_001" |
| `merchant_ref` | String | Merchant order reference | ORDER_001 |
| `settlement_date` | Date | Settlement date | 2024-01-16 |
| `utr` | String | Unique Transaction Ref | UTR001234567 |

---

## 🎯 V1 Standard Bank Format (After Normalization)

### **Target Schema:**

```csv
utr,rrn,amount_paise,currency,transaction_date,acquirer_ref,merchant_ref,status_code,auth_code
UTR001234567,,250000,INR,2024-01-15T00:00:00Z,HDFC001,ORDER_001,SUCCESS,
UTR001234568,,175000,INR,2024-01-15T00:00:00Z,HDFC002,ORDER_002,SUCCESS,
UTR001234569,,300000,INR,2024-01-15T00:00:00Z,HDFC003,ORDER_003,SUCCESS,
```

### **V1 Standard Columns:**
| Column Name | Data Type | Description | Example |
|-------------|-----------|-------------|---------|
| `utr` | String | Unique Transaction Reference | UTR001234567 |
| `rrn` | String | Retrieval Reference Number | (optional) |
| `amount_paise` | Integer | Amount in paise | 250000 |
| `currency` | String | Currency code | INR |
| `transaction_date` | ISO 8601 | Transaction timestamp | 2024-01-15T00:00:00Z |
| `acquirer_ref` | String | Bank/Acquirer reference | HDFC001 |
| `merchant_ref` | String | Merchant reference | ORDER_001 |
| `status_code` | String | Transaction status | SUCCESS |
| `auth_code` | String | Authorization code | (optional) |

---

## 🔄 HDFC Column Mapping (V1 Configuration)

### **Mapping Configuration:**

```json
{
  "acquirer": "HDFC",
  "file_type": "RECON",
  "version": 1,
  "is_default": true,
  "delimiter": ",",
  "header_rows": 1,
  "date_format": "yyyy-MM-dd",
  "timezone": "Asia/Kolkata",
  "number_locale": "en_IN",
  
  "column_mappings": {
    "utr": {
      "sourceColumn": "utr",                    // ← HDFC column
      "targetColumn": "utr",                    // → Standard column
      "dataType": "STRING",
      "required": true
    },
    "amount_paise": {
      "sourceColumn": "amount",                 // ← HDFC column (rupees)
      "targetColumn": "amount_paise",           // → Standard column (paise)
      "dataType": "MONEY",
      "required": true
    },
    "transaction_date": {
      "sourceColumn": "txn_date",               // ← HDFC column
      "targetColumn": "transaction_date",       // → Standard column
      "dataType": "DATE",
      "required": true
    },
    "acquirer_ref": {
      "sourceColumn": "bank_ref",               // ← HDFC column
      "targetColumn": "acquirer_ref",           // → Standard column
      "dataType": "STRING",
      "required": true
    },
    "merchant_ref": {
      "sourceColumn": "merchant_ref",           // ← HDFC column
      "targetColumn": "merchant_ref",           // → Standard column
      "dataType": "STRING",
      "required": false
    },
    "status_code": {
      "sourceColumn": "credit_debit",           // ← HDFC column
      "targetColumn": "status_code",            // → Standard column
      "dataType": "STRING",
      "required": false
    }
  },
  
  "transforms": [
    {
      "type": "MONEY_RUPEES_TO_PAISE",
      "field": "amount_paise",
      "params": {
        "sourceField": "amount",
        "locale": "en_IN"
      }
    },
    {
      "type": "DATE_PARSE",
      "field": "transaction_date",
      "params": {
        "sourceField": "txn_date",
        "format": "yyyy-MM-dd",
        "timezone": "Asia/Kolkata"
      }
    },
    {
      "type": "MAP_VALUE",
      "field": "status_code",
      "params": {
        "sourceField": "credit_debit",
        "mapping": {
          "CR": "SUCCESS",
          "DR": "DEBIT"
        },
        "default": "UNKNOWN"
      }
    },
    {
      "type": "DEFAULT_VALUE",
      "field": "currency",
      "params": {
        "value": "INR"
      }
    }
  ]
}
```

---

## 📊 Mapping Table (Visual)

### **HDFC → V1 Standard**

| HDFC Bank Column | Data Type | → | V1 Standard Column | Transformation |
|------------------|-----------|---|-------------------|----------------|
| `utr` | String | → | `utr` | ✅ Direct copy |
| `amount` | Decimal (₹) | → | `amount_paise` | ✅ ₹2500.00 → 250000 paise |
| `txn_date` | Date | → | `transaction_date` | ✅ Parse to ISO 8601 |
| `bank_ref` | String | → | `acquirer_ref` | ✅ Direct copy |
| `merchant_ref` | String | → | `merchant_ref` | ✅ Direct copy |
| `credit_debit` | String | → | `status_code` | ✅ CR → SUCCESS, DR → DEBIT |
| `settlement_date` | Date | → | (not mapped) | ❌ Ignored |
| `description` | String | → | (not mapped) | ❌ Ignored |
| (none) | - | → | `currency` | ✅ Default: "INR" |
| (none) | - | → | `rrn` | ✅ Default: null |

---

## 🔍 Example Transformation

### **Input (HDFC Raw):**
```json
{
  "bank_ref": "HDFC001",
  "txn_date": "2024-01-15",
  "amount": "2500.00",
  "credit_debit": "CR",
  "description": "UPI TXN RZP_TXN_001",
  "merchant_ref": "ORDER_001",
  "settlement_date": "2024-01-16",
  "utr": "UTR001234567"
}
```

### **Step 1: Apply Column Mappings**
```json
{
  "utr": "UTR001234567",           // utr → utr
  "amount": "2500.00",             // amount → amount (still rupees)
  "transaction_date": "2024-01-15", // txn_date → transaction_date
  "acquirer_ref": "HDFC001",       // bank_ref → acquirer_ref
  "merchant_ref": "ORDER_001",     // merchant_ref → merchant_ref
  "status_code": "CR"              // credit_debit → status_code
}
```

### **Step 2: Apply Transforms**
```json
{
  "utr": "UTR001234567",
  "amount_paise": 250000,                      // ✅ 2500.00 * 100
  "transaction_date": "2024-01-15T00:00:00Z",  // ✅ Parsed to ISO
  "acquirer_ref": "HDFC001",
  "merchant_ref": "ORDER_001",
  "status_code": "SUCCESS",                    // ✅ CR → SUCCESS
  "currency": "INR"                            // ✅ Default added
}
```

### **Output (V1 Standard):**
```json
{
  "utr": "UTR001234567",
  "rrn": null,
  "amount_paise": 250000,
  "currency": "INR",
  "transaction_date": "2024-01-15T00:00:00Z",
  "acquirer_ref": "HDFC001",
  "merchant_ref": "ORDER_001",
  "status_code": "SUCCESS",
  "auth_code": null
}
```

---

## 🏦 Other Bank Examples

### **AXIS Bank Columns (Different Format):**
```
id, amount, date, ref_number, txn_type, bank_remarks
```

**Mapping:**
- `id` → `utr`
- `amount` → `amount_paise` (with rupees → paise transform)
- `date` → `transaction_date`
- `ref_number` → `acquirer_ref`

### **ICICI Bank Columns (Different Format):**
```
transaction_ref, credit_amount, txn_datetime, merchant_id, status, rrn
```

**Mapping:**
- `transaction_ref` → `utr`
- `credit_amount` → `amount_paise`
- `txn_datetime` → `transaction_date`
- `merchant_id` → `merchant_ref`
- `rrn` → `rrn`

---

## ✅ Summary

### **What V1 Does:**

1. **Detects Bank:** From filename `HDFC_NEFT_20240115.csv` → acquirer = "HDFC"
2. **Fetches Mapping:** Queries `recon_mapping_template` for HDFC + RECON + is_default=true
3. **Applies Column Mapping:** Maps HDFC columns to standard columns
4. **Applies Transforms:** 
   - Rupees → Paise conversion
   - Date parsing to ISO 8601
   - Status code mapping (CR → SUCCESS)
   - Default values (currency = INR)
5. **Output:** Normalized V1 standard format ready for reconciliation

### **Key Differences per Bank:**
- **Column Names:** Different for each bank
- **Date Format:** HDFC uses `yyyy-MM-dd`, others vary
- **Amount Format:** Some in rupees, some in paise
- **Status Codes:** Each bank has different codes (CR/DR, SUCCESS/FAILED, etc.)
- **Required Fields:** Some banks include RRN, some don't

### **V1 Handles All This Through:**
- ✅ Flexible JSONB column mappings
- ✅ Configurable transform pipeline
- ✅ Per-bank configuration templates
- ✅ One standard output format

---

**Next:** Build same system for V2 to handle all bank formats automatically! 🚀
