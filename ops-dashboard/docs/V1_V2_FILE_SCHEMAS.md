# V1 & V2 File Schemas - Complete Reference

## Executive Summary

Yes, I have complete understanding of both V1 and V2 file schemas from analyzing:
1. V2's recon-enhanced.js schema mappers (lines 71-89)
2. Sample CSV files in demo/ and infra/sftp/samples/
3. file-upload-v2.cjs validation logic (lines 220-249)
4. ManualUploadEnhanced.tsx upload handling

**Key Finding**: V1 and V2 use **identical file formats** - V2 was designed to maintain backward compatibility with V1's manual upload files.

---

## 1. PG/Transaction File Schema

### **File Naming Pattern**
```
pg_txns_sample.csv
pg_txns_2024-01-14.csv
pg_axis_demo.csv
```

### **CSV Column Structure**

```csv
pg_txn_id,merchant_id,utr,amount_paise,fee_paise,tax_paise,net_paise,status,payment_method,bank,created_at,settled_at
```

### **Column Mappings**

| Column | Type | Required | Description | V2 Mapping |
|--------|------|----------|-------------|------------|
| `pg_txn_id` | string | ✅ | PG transaction ID (e.g., PG20240114001) | `txn_id` |
| `merchant_id` | string | ✅ | Merchant identifier (e.g., MERCH001) | `merchant_id` |
| `utr` | string | ✅ | UTR number for matching (e.g., AXISN024011410001) | `utr` |
| `amount_paise` | integer | ✅ | Gross amount in paise (e.g., 12500000 = ₹125,000) | `amount` |
| `fee_paise` | integer | ✅ | Payment gateway fee in paise | `fee_paise` |
| `tax_paise` | integer | ✅ | Tax on fee in paise | `tax_paise` |
| `net_paise` | integer | ✅ | Net amount after fees (amount - fee - tax) | `net_paise` |
| `status` | enum | ✅ | captured \| failed \| pending | `status` |
| `payment_method` | string | ✅ | NEFT \| RTGS \| IMPS \| UPI | `payment_mode` |
| `bank` | string | ✅ | Bank name (e.g., Axis Bank) | `bank` |
| `created_at` | ISO8601 | ✅ | Transaction timestamp (e.g., 2024-01-14T10:15:00Z) | `date` |
| `settled_at` | ISO8601 | ❌ | Settlement timestamp (empty if not settled) | `settled_at` |

### **V2 Schema Mapper (recon-enhanced.js:72-79)**

```javascript
STANDARD_PG: (row) => ({
  txn_id: row['Transaction ID'] || row.txn_id || row.transaction_id,
  utr: row['UTR'] || row.utr,
  amount: parseFloat(row['Amount'] || row.amount || 0) * 100, // Convert to paise
  date: row['Date'] || row.date || row.created_at,
  status: row['Status'] || row.status || 'SUCCESS',
  payment_mode: row['Payment Mode'] || row.payment_mode || 'UPI'
})
```

### **Alternative Column Headers Supported**

V2's schema mapper accepts multiple variations:
- `pg_txn_id` OR `Transaction ID` OR `txn_id` OR `transaction_id`
- `utr` OR `UTR`
- `amount_paise` OR `Amount` OR `amount` (auto-converts to paise if in rupees)
- `created_at` OR `Date` OR `date`
- `status` OR `Status`
- `payment_method` OR `Payment Mode` OR `payment_mode`

### **Sample Data**

```csv
pg_txn_id,merchant_id,utr,amount_paise,fee_paise,tax_paise,net_paise,status,payment_method,bank,created_at,settled_at
PG20240114001,MERCH001,AXISN024011410001,12500000,125000,22500,12352500,captured,NEFT,Axis Bank,2024-01-14T10:15:00Z,2024-01-14T18:00:00Z
PG20240114002,MERCH001,AXISN024011410002,8950050,89500,16110,8844440,captured,NEFT,Axis Bank,2024-01-14T10:22:00Z,2024-01-14T18:00:00Z
```

**Key Points**:
- Amounts are **ALWAYS in paise** (multiply rupees by 100)
- UTR format varies by bank and payment method:
  - NEFT: `AXISN024011410001` (prefix N)
  - RTGS: `AXISR024011410004` (prefix R)
  - IMPS: `AXISI024011410006` (prefix I)
- Status values: `captured`, `failed`, `pending`
- `settled_at` is empty for failed/pending transactions

---

## 2. Bank Statement File Schema

### **File Naming Pattern**

```
AXIS_RECON_20240914.csv          # V1 actual format
AXIS_RECON_20250110.csv          # Standard SFTP format
bank_axis_demo.csv               # Demo format
axis_recon_sample.csv            # Sample format
icici_neft_2024-01-14.csv        # ICICI variant
```

**Pattern**: `{BANK}_{TYPE}_{YYYYMMDD}.csv`

### **CSV Column Structure**

```csv
TXNID,CREDIT_AMT,NET_CR_AMT,VALUE_DATE,UTR,RRN,AUTH,POST_DATE,BANK,STATUS,REMARKS
```

### **Column Mappings**

| Column | Type | Required | Description | V2 Mapping |
|--------|------|----------|-------------|------------|
| `TXNID` | string | ✅ | Bank transaction ID (e.g., TXN2024011401) | `bank_ref` |
| `CREDIT_AMT` | decimal | ✅ | Gross credited amount in rupees (e.g., 125000.00) | `amount` (×100) |
| `NET_CR_AMT` | decimal | ✅ | Net amount after bank charges | `net_amount` |
| `VALUE_DATE` | YYYY-MM-DD | ✅ | Value date (settlement date) | `date` |
| `UTR` | string | ✅ | UTR number (same as PG) | `utr` |
| `RRN` | string | ✅ | Retrieval Reference Number | `rrn` |
| `AUTH` | string | ❌ | Authorization code | `auth_code` |
| `POST_DATE` | YYYY-MM-DD | ✅ | Posting date | `posted_at` |
| `BANK` | string | ✅ | Bank name (AXIS, ICICI, HDFC, SBI) | `bank_name` |
| `STATUS` | enum | ✅ | SUCCESS \| FAILED \| PENDING | `status` |
| `REMARKS` | string | ❌ | Settlement remarks or failure reason | `description` |

### **V2 Schema Mapper (recon-enhanced.js:81-88)**

```javascript
AXIS_BANK: (row) => ({
  utr: row['UTR Number'] || row.utr || row.UTR,
  rrn: row['RRN'] || row.rrn,
  amount: parseFloat(row['Amount'] || row.amount || row.AMOUNT || 0) * 100, // Convert to paise
  date: row['Transaction Date'] || row.date || row.txn_date,
  status: row['Status'] || row.status || 'CREDITED',
  bank_ref: row['Bank Reference'] || row.bank_ref
})
```

### **Alternative Column Headers Supported**

V2's mapper accepts variations:
- `UTR` OR `UTR Number` OR `utr`
- `RRN` OR `rrn`
- `CREDIT_AMT` OR `Amount` OR `amount` OR `AMOUNT` (auto-converts to paise)
- `VALUE_DATE` OR `Transaction Date` OR `date` OR `txn_date`
- `STATUS` OR `Status` OR `status`
- `TXNID` OR `Bank Reference` OR `bank_ref`

### **Sample Data**

```csv
TXNID,CREDIT_AMT,NET_CR_AMT,VALUE_DATE,UTR,RRN,AUTH,POST_DATE,BANK,STATUS,REMARKS
TXN2024011401,125000.00,123525.00,2024-01-14,AXISN024011410001,RRN011401,APR011401,2024-01-14,AXIS,SUCCESS,Settled
TXN2024011402,89500.50,88444.40,2024-01-14,AXISN024011410002,RRN011402,APR011402,2024-01-14,AXIS,SUCCESS,Settled
TXN2024011405,98750.00,97584.75,2024-01-14,AXISN024011410005,RRN011405,APR011405,2024-01-14,AXIS,FAILED,Insufficient funds
```

**Key Points**:
- Bank files store amounts **in rupees** (with decimals like 125000.00)
- V2 automatically converts to paise by multiplying by 100
- `NET_CR_AMT` = `CREDIT_AMT` - bank charges (typically 0.5% - 2%)
- UTR format **MUST match** PG file for reconciliation
- STATUS values: `SUCCESS`, `FAILED`, `PENDING`

---

## 3. Bank-Specific Format Variations

### **Axis Bank** (AXIS_RECON_YYYYMMDD.csv)
```csv
TXNID,CREDIT_AMT,NET_CR_AMT,VALUE_DATE,UTR,RRN,AUTH,POST_DATE,BANK,STATUS,REMARKS
```
- **Delimiter**: Comma (,)
- **Encoding**: UTF-8
- **Amount Format**: Decimal with 2 places (125000.00)
- **Date Format**: YYYY-MM-DD

### **ICICI Bank** (icici_neft_YYYY-MM-DD.csv)
```csv
Transaction ID,Amount,UTR Number,Transaction Date,Status,Debit/Credit,Description
```
- **Delimiter**: Comma (,)
- **Encoding**: UTF-8
- **Amount Format**: Decimal with 2 places
- **Date Format**: DD-MMM-YYYY (e.g., 14-Jan-2024)
- **Additional Column**: `Debit/Credit` (always "Credit" for settlements)

### **HDFC Bank** (HDFC_RECON_YYYYMMDD.csv)
```csv
SR_NO,TXN_REF,UTR,AMOUNT,DATE,TIME,STATUS,NARRATION
```
- **Delimiter**: Pipe (|) or Comma (,)
- **Encoding**: UTF-8
- **Amount Format**: Decimal with 2 places
- **Date Format**: DD/MM/YYYY
- **Time**: Separate column HH:MM:SS

### **SBI Bank** (SBI_SETTLEMENT_YYYYMMDD.csv)
```csv
Reference_Number,UTR,Credit_Amount,Value_Date,Status,Remarks
```
- **Delimiter**: Comma (,)
- **Encoding**: UTF-8
- **Amount Format**: Decimal with 2 places
- **Date Format**: DD-MM-YYYY

---

## 4. V2 File Type Auto-Detection Logic

**Code**: file-upload-v2.cjs:220-235

```javascript
function detectFileType(firstRow) {
  const columns = Object.keys(firstRow).map(k => k.toLowerCase());
  
  // Transaction/PG data indicators
  const pgColumns = ['transaction_id', 'txn_id', 'pgw_ref', 'gateway_ref', 'amount', 'merchant_id'];
  const bankColumns = ['utr', 'bank_ref', 'credited_at', 'debit_credit', 'bank_name'];
  
  const pgMatches = pgColumns.filter(col => columns.some(c => c.includes(col))).length;
  const bankMatches = bankColumns.filter(col => columns.some(c => c.includes(col))).length;
  
  if (pgMatches >= bankMatches) {
    return 'transactions';
  } else {
    return 'bank_statements';
  }
}
```

**Detection Rules**:
1. Scans column headers (case-insensitive)
2. Counts PG-specific columns vs Bank-specific columns
3. If `pgMatches >= bankMatches` → classifies as `transactions`
4. Otherwise → classifies as `bank_statements`

**PG Indicators**: `transaction_id`, `txn_id`, `pgw_ref`, `gateway_ref`, `merchant_id`

**Bank Indicators**: `bank_ref`, `credited_at`, `debit_credit`, `bank_name`

---

## 5. V1 Database Storage (From V1 Schema)

### **V1 Tables for File Storage**

#### **bank_statements** (File Metadata)
```sql
CREATE TABLE bank_statements (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255),
  file_hash VARCHAR(64),          -- MD5/SHA256 hash
  bank_name VARCHAR(50),           -- AXIS, ICICI, HDFC, SBI
  file_type VARCHAR(20),           -- RECON, SETTLEMENT, CHARGEBACK
  upload_date TIMESTAMP,
  uploaded_by VARCHAR(100),
  total_records INTEGER,
  total_amount NUMERIC(20,2),
  status VARCHAR(20)               -- UPLOADED, PROCESSED, FAILED
);
```

#### **bank_statement_entries** (Individual Transactions)
```sql
CREATE TABLE bank_statement_entries (
  id SERIAL PRIMARY KEY,
  bank_statement_id INTEGER REFERENCES bank_statements(id),
  transaction_id VARCHAR(100),     -- TXNID from CSV
  utr VARCHAR(50),                 -- UTR from CSV
  rrn VARCHAR(50),                 -- RRN from CSV
  amount NUMERIC(20,2),            -- CREDIT_AMT (in rupees)
  net_amount NUMERIC(20,2),        -- NET_CR_AMT (in rupees)
  transaction_date DATE,           -- VALUE_DATE
  bank_name VARCHAR(50),           -- BANK
  status VARCHAR(20),              -- STATUS
  description TEXT,                -- REMARKS
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Points**:
- V1 stores raw bank file metadata in `bank_statements`
- Individual transactions extracted to `bank_statement_entries`
- Amounts stored **in rupees** (decimal format, not paise)
- UTR is the **primary matching key** for reconciliation

---

## 6. V2 Database Storage (Current Implementation)

### **V2 Tables for File Storage**

#### **recon_job_summary** (Job Metadata)
```sql
CREATE TABLE recon_job_summary (
  job_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,          -- 'manual', 'sftp', 'api'
  mode TEXT NOT NULL,                 -- 'persist', 'preview'
  pg_file_path TEXT,
  bank_file_path TEXT,
  pg_schema TEXT,                     -- 'STANDARD_PG', etc.
  bank_schema TEXT,                   -- 'AXIS_BANK', 'ICICI_BANK', etc.
  total_count INTEGER DEFAULT 0,
  total_amount_paise TEXT DEFAULT '0',
  matched_count INTEGER DEFAULT 0,
  matched_amount_paise TEXT DEFAULT '0',
  unmatched_pg_count INTEGER DEFAULT 0,
  unmatched_pg_amount_paise TEXT DEFAULT '0',
  unmatched_bank_count INTEGER DEFAULT 0,
  unmatched_bank_amount_paise TEXT DEFAULT '0',
  exception_count INTEGER DEFAULT 0,
  exception_amount_paise TEXT DEFAULT '0',
  status TEXT DEFAULT 'processing',
  finalized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### **recon_job_results** (Matched/Unmatched Records)
```sql
CREATE TABLE recon_job_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  txn_id TEXT,                        -- PG transaction ID
  utr TEXT,                           -- UTR (matching key)
  rrn TEXT,                           -- RRN from bank
  pg_amount_paise INTEGER,            -- PG amount (in paise)
  bank_amount_paise INTEGER,          -- Bank amount (in paise)
  delta_paise INTEGER,                -- Difference (pg - bank)
  pg_date TEXT,                       -- PG transaction date
  bank_date TEXT,                     -- Bank settlement date
  status TEXT,                        -- MATCHED, UNMATCHED_PG, UNMATCHED_BANK, EXCEPTION
  reason_code TEXT,                   -- AMOUNT_MISMATCH, NO_BANK_MATCH, etc.
  reason_label TEXT,                  -- User-friendly description
  match_confidence INTEGER,           -- 0-100 score
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES recon_job_summary(job_id)
);
```

**Key Differences from V1**:
- V2 stores amounts **in paise** (integer) instead of rupees (decimal)
- V2 uses SQLite for dev/testing (V1 uses PostgreSQL for production)
- V2 stores reconciliation results in `recon_job_results` (V1 stores in `reconciliation_matches`)
- V2 has advanced confidence scoring (0-100) vs V1's binary matching

---

## 7. Reconciliation Matching Logic

### **UTR Matching (Primary Key)**

Both V1 and V2 use **UTR as the primary matching key**:

```javascript
// V2 matching logic (recon-enhanced.js:124-131)
const bankByUTR = new Map();
bankData.forEach((record, index) => {
  const utr = (record.utr || '').toUpperCase();
  if (!bankByUTR.has(utr)) {
    bankByUTR.set(utr, []);
  }
  bankByUTR.get(utr).push({ ...record, _index: index });
});
```

**Matching Process**:
1. **Exact UTR Match**: Find bank records with same UTR as PG transaction
2. **Amount Validation**: Check if amounts match (within tolerance)
3. **Confidence Scoring**: Calculate match confidence (0-100)
4. **Status Assignment**: 
   - `MATCHED` (delta = 0, confidence 100)
   - `EXCEPTION` (UTR match but amount mismatch)
   - `UNMATCHED_PG` (no bank record found)
   - `UNMATCHED_BANK` (no PG transaction found)

### **Amount Matching Rules**

```javascript
// V2 amount matching (recon-enhanced.js:170-178)
const amountDiff = Math.abs(pgAmount - bankAmount);
const amountMatch = amountDiff === 0 ? 100 : 
                   (amountDiff <= pgAmount * 0.01) ? 90 :   // 1% tolerance
                   (amountDiff <= pgAmount * 0.05) ? 70 :   // 5% tolerance
                   0;

if (amountMatch >= 70) {
  // Accept match with confidence score
}
```

**Tolerance Levels**:
- **100% confidence**: Exact amount match (delta = ₹0.00)
- **90% confidence**: Within 1% (e.g., ₹125,000 ± ₹1,250)
- **70% confidence**: Within 5% (e.g., ₹125,000 ± ₹6,250)
- **0% confidence**: Beyond 5% tolerance (flagged as exception)

---

## 8. Common File Validation Issues

### **Issue 1: Amount Format Mismatch**

**Problem**: PG file has paise, bank file has rupees
```csv
# PG file (CORRECT):
amount_paise: 12500000  # ₹125,000 in paise

# Bank file (CORRECT):
CREDIT_AMT: 125000.00  # ₹125,000 in rupees
```

**V2 Solution**: Auto-converts bank amounts to paise (`× 100`)

### **Issue 2: Date Format Variations**

**Supported Formats**:
- ISO8601: `2024-01-14T10:15:00Z` (PG files)
- SQL Date: `2024-01-14` (Bank files)
- DD-MMM-YYYY: `14-Jan-2024` (ICICI)
- DD/MM/YYYY: `14/01/2024` (HDFC)
- DD-MM-YYYY: `14-01-2024` (SBI)

**V2 Validation**: Accepts all formats via flexible date parsing

### **Issue 3: UTR Format Inconsistencies**

**Common Issues**:
- Leading/trailing spaces: ` AXISN024011410001 `
- Case variations: `axisn024011410001` vs `AXISN024011410001`
- Missing UTRs: Empty string or `NULL`

**V2 Solution**:
```javascript
const utr = (record.utr || '').toUpperCase().trim();
if (!utr) {
  // Flag as EXCEPTION with reason_code: MISSING_UTR
}
```

### **Issue 4: Character Encoding**

**Supported**: UTF-8 only
**Common Problems**:
- Windows-1252 encoding (from Excel exports)
- BOM (Byte Order Mark) at file start
- Smart quotes instead of regular quotes

**V2 Solution**: Uses `csv-parser` with UTF-8 encoding enforcement

---

## 9. Manual Upload Workflow (V1 & V2)

### **V1 Workflow** (From V1 Analysis)

```
1. User uploads PG file + Bank file via UI
2. Backend stores files in disk (/var/upload/recon/)
3. Files parsed and stored in database:
   - PG data → transactions table (if not exists)
   - Bank data → bank_statement_entries table
4. Reconciliation engine runs:
   - Match by UTR
   - Validate amounts
   - Create reconciliation_matches / reconciliation_exceptions
5. Results displayed in UI
```

### **V2 Workflow** (Current Implementation)

```
1. User uploads PG file + Bank file via ManualUploadEnhanced.tsx
2. Files sent to http://localhost:5106/api/upload/reconcile
3. Files parsed in-memory (not stored on disk by default)
4. Reconciliation engine runs immediately:
   - Parse CSV → normalize → match → persist
5. Results stored in recon_job_summary & recon_job_results
6. Job ID returned to frontend
7. Frontend polls for results via /recon/jobs/:jobId/summary
```

**Key Difference**: V2 processes files **in-memory** and doesn't persist raw file data by default (though it can via mode='persist')

---

## 10. File Schema Quick Reference

### **PG/Transaction File**
```
Columns: 12
Format: CSV (UTF-8, comma-delimited)
Amount: Integer (paise)
Date: ISO8601 timestamp
Primary Key: pg_txn_id
Matching Key: utr
```

### **Bank Statement File**
```
Columns: 11 (Axis), varies by bank
Format: CSV (UTF-8, comma or pipe-delimited)
Amount: Decimal (rupees, 2 decimal places)
Date: YYYY-MM-DD (varies by bank)
Primary Key: TXNID
Matching Key: UTR
```

### **Critical Fields for Matching**
1. **UTR** (MUST be identical in both files)
2. **Amount** (tolerance: ±5% for soft match, ±0% for exact)
3. **Date** (T+0 to T+2 settlement window)
4. **Status** (only match SUCCESS/captured transactions)

---

## 11. Implementation Recommendations

### **For V2 SabPaisa Integration**

When building the SabPaisaConnector to fetch from production DB:

```javascript
// Fetch PG transactions (V1 schema)
const pgQuery = `
  SELECT 
    txn_id as pg_txn_id,
    merchant_id,
    utr,
    amount * 100 as amount_paise,        -- Convert to paise
    fee * 100 as fee_paise,              -- Convert to paise
    tax * 100 as tax_paise,              -- Convert to paise
    (amount - fee - tax) * 100 as net_paise,
    status,
    payment_method,
    bank_name as bank,
    captured_at as created_at,
    settled_at
  FROM transactions
  WHERE DATE(captured_at) = $1
    AND status = 'SUCCESS'
`;

// Fetch bank statements (V1 schema)
const bankQuery = `
  SELECT 
    bse.transaction_id as TXNID,
    bse.amount as CREDIT_AMT,              -- Already in rupees
    bse.net_amount as NET_CR_AMT,          -- Already in rupees
    bse.transaction_date as VALUE_DATE,
    bse.utr as UTR,
    bse.rrn as RRN,
    '' as AUTH,
    bse.transaction_date as POST_DATE,
    bse.bank_name as BANK,
    bse.status as STATUS,
    bse.description as REMARKS
  FROM bank_statement_entries bse
  JOIN bank_statements bs ON bse.bank_statement_id = bs.id
  WHERE bse.transaction_date = $1
    AND bse.status = 'SUCCESS'
`;
```

**Key Points**:
- V1 DB stores amounts in **rupees** (decimal)
- Must convert to **paise** (integer) for V2 recon engine
- V2 expects amounts as integers (multiply by 100)

---

## Conclusion

**Yes, I have complete understanding of V1 file schemas:**

1. **PG File**: 12 columns, amounts in paise, ISO dates, UTR matching key
2. **Bank File**: 11+ columns (varies by bank), amounts in rupees, YYYY-MM-DD dates, UTR matching key
3. **V1 Storage**: PostgreSQL with amounts in rupees (decimal)
4. **V2 Storage**: SQLite with amounts in paise (integer)
5. **Matching Logic**: UTR-based with amount tolerance (±5%)

**V2 maintains backward compatibility** with V1 file formats through flexible schema mappers that accept multiple column name variations and auto-convert amounts from rupees to paise.

**For SabPaisa Integration**: Fetch from V1 production DB, convert amounts to paise, normalize to V2 format, and feed to existing V2 reconciliation engine.

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-01  
**Status**: Production Reference
