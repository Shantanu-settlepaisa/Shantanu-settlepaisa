# SettlePaisa V1 - Complete System Context

**Generated**: October 2, 2025  
**Source**: V1 Staging Database Analysis (3.108.237.99) + SettlePaisa 2.0 Code Analysis  
**Database**: `settlepaisa`  
**Version**: V1 (Production System)  
**Additional Analysis**: SettlePaisa 2.0 Reconciliation Service (Java/Spring Boot)

---

## 🎯 Executive Summary

SettlePaisa V1 is the production reconciliation and settlement platform currently in use. This document provides comprehensive context from database schema analysis, covering:

1. **Database Architecture** - 56 tables analyzed
2. **Reconciliation System** - File upload, matching logic, and configuration
3. **Settlement Pipeline** - Transaction processing and payout workflow
4. **Data Models** - Key entities and relationships

**Key Findings**:
- ✅ V1 uses **flexible column mapping** via `recon_configs` table
- ✅ Supports **CSV and XLSX** file formats
- ✅ **89 reconciliation records** and **81 settled transactions** in staging
- ✅ Column names are **user-configurable** per merchant/bank

---

## 📊 Database Schema Overview

### **Core Tables (56 Total)**

#### **Reconciliation Tables**
| Table | Records | Purpose |
|-------|---------|---------|
| `recon_configs` | Config entries | Column mapping configurations for file uploads |
| `recon_upload` | 28 | File upload tracking and history |
| `transaction_recon_table` | 89 | Main reconciliation data table |
| `transaction_recon_table_import_log` | - | Import audit trail |
| `recon_import_log` | - | Reconciliation process logs |

#### **Settlement Tables**
| Table | Records | Purpose |
|-------|---------|---------|
| `settled_transactions` | 81 | Final settled transaction records |
| `transactions_to_settle` | - | Pending settlement queue |

#### **Merchant/Business Tables**
| Table | Purpose |
|-------|---------|
| `merchant_data` | Merchant master data (clientcode, companyname, etc.) |
| `merchant_bank` | Merchant bank account details |
| `merchant_base_rate` | Fee/commission rates |
| `merchant_fee_bearer` | Fee bearer configuration |
| `merchant_type` | Merchant categorization |

#### **Configuration Tables**
| Table | Purpose |
|-------|---------|
| `bank_master` | Bank list and details |
| `payment_mode` | Payment method configurations |
| `transaction_mode_master` | Transaction mode mappings |
| `business_type` | Business category master |
| `rules_master` | Business rules engine |

#### **User/Auth Tables**
| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `roles` | User roles |
| `role_permission` | RBAC permissions |
| `stakeholders` | External stakeholders |

---

## 🔧 Reconciliation System Architecture

### **1. File Upload Process**

#### **Table: `recon_upload`**
```sql
CREATE TABLE recon_upload (
  id INTEGER PRIMARY KEY,
  created_at TIMESTAMP,
  recon_name VARCHAR,          -- File/recon job name
  encrypted_url TEXT,           -- S3/file storage URL (encrypted)
  decrypted_url TEXT,           -- Accessible file URL
  created_by INTEGER            -- User ID who uploaded
);
```

**Current Data**: 28 file uploads tracked

**Upload Flow**:
1. User uploads CSV/XLSX file via UI
2. File stored in S3/storage with encrypted URL
3. Record created in `recon_upload` table
4. File parsed based on `recon_configs` mapping
5. Data inserted into `transaction_recon_table`

---

### **2. Reconciliation Configuration System**

#### **Table: `recon_configs`**

**Purpose**: Maps CSV/XLSX column headers to database fields (flexible schema)

```sql
CREATE TABLE recon_configs (
  id BIGINT PRIMARY KEY,
  config_name VARCHAR,                  -- Configuration name (e.g., "BOB Sensitive", "CSV")
  file_type VARCHAR,                    -- 'csv' | 'xlsx'
  delimitter VARCHAR,                   -- For CSV: comma, tab, etc.
  
  -- Column Mappings (actual CSV header names)
  transaction_id VARCHAR,               -- e.g., "Txn_id", "Merchant Track ID"
  paid_amount VARCHAR,                  -- e.g., "Net_amount", "net amouNT"
  payee_amount VARCHAR,                 -- e.g., "Gross_amount", "tRANSACTION aMOUNT"
  transaction_date_time VARCHAR,        -- e.g., "Txn_date", "transaction dATE"
  payment_date_time VARCHAR,            -- e.g., "Payment_date", "payment dATE"
  bank_name VARCHAR,                    -- e.g., "Payment_bank", "bob"
  is_on_us VARCHAR,                     -- e.g., "onus indicator", "0"
  
  -- Not currently mapped
  transaction_mode VARCHAR,
  transaction_approver VARCHAR,
  transaction_status VARCHAR,
  
  -- Metadata
  company_domain VARCHAR,
  created_by VARCHAR,
  created_on TIMESTAMP,
  updated_by VARCHAR,
  updated_on TIMESTAMP
);
```

**Sample Configurations**:

**Config 1: BOB Bank (XLSX)**
```json
{
  "config_name": "bob sensitive",
  "file_type": "xlsx",
  "transaction_id": "mErchant tRack ID",
  "paid_amount": "net amouNT",
  "payee_amount": "tRANSACTION aMOUNT",
  "transaction_date_time": "transaction dATE",
  "payment_date_time": "payment dATE",
  "bank_name": "bob",
  "is_on_us": "onus indicator"
}
```

**Config 2: Standard CSV**
```json
{
  "config_name": "CSV",
  "file_type": "csv",
  "transaction_id": "Txn_id",
  "paid_amount": "Net_amount",
  "payee_amount": "Gross_amount",
  "transaction_date_time": "Txn_date",
  "payment_date_time": "Payment_date",
  "bank_name": "Payment_bank",
  "is_on_us": "0"
}
```

**Key Insight**: Column names are **NOT fixed** - they are configured per merchant/bank. This allows flexibility for different bank statement formats.

---

### **3. Transaction Reconciliation Table**

#### **Table: `transaction_recon_table`**

**Purpose**: Stores all reconciliation transaction data after file upload

```sql
CREATE TABLE transaction_recon_table (
  id BIGINT PRIMARY KEY,
  
  -- Transaction Details
  transaction_id VARCHAR,              -- PG/Bank transaction ID
  gross_amount DOUBLE PRECISION,       -- Original transaction amount
  payee_amount DOUBLE PRECISION,       -- Amount paid to merchant
  paid_amount DOUBLE PRECISION,        -- Amount actually settled
  net_amount DOUBLE PRECISION,         -- Net after fees
  
  -- Dates
  trans_date TIMESTAMP,                -- Transaction date
  payment_date TIMESTAMP,              -- Payment/settlement date
  recon_date DATE,                     -- Reconciliation date
  
  -- Status
  transaction_status VARCHAR,          -- 'Completed', 'Pending', 'Failed'
  is_recon_matched BOOLEAN,            -- Reconciliation match status
  
  -- Payment Info
  transaction_mode INTEGER,            -- Payment method (FK to transaction_mode_master)
  payment_bank VARCHAR,                -- Bank name
  is_on_us INTEGER,                    -- On-us transaction flag (0/1)
  
  -- Metadata
  transaction_approver VARCHAR,
  company_domain VARCHAR,
  created_by VARCHAR,
  created_on TIMESTAMP
);
```

**Sample Data** (Staging DB):
```json
{
  "transaction_id": "122372006251292569",
  "paid_amount": 4852,
  "payee_amount": 4852,
  "transaction_status": "Completed",
  "is_recon_matched": true,
  "payment_date": "2025-06-19T18:30:00.000Z",
  "payment_bank": "payment_bank"
}
```

**Current Statistics**:
- Total records: **89**
- All records have `is_recon_matched: true`
- Payment dates range: June 2025
- Amounts in **paise** (4852 = ₹48.52)

---

## 💰 Settlement System

### **Table: `settled_transactions`**

**Purpose**: Final settled transaction records (after reconciliation)

```sql
CREATE TABLE settled_transactions (
  id BIGINT PRIMARY KEY,
  
  -- Transaction Reference
  transaction_id VARCHAR,
  
  -- Amounts
  gross_amount DOUBLE PRECISION,       -- Total transaction amount
  net_amount DOUBLE PRECISION,         -- After fees
  settlement_amount DOUBLE PRECISION,  -- Amount settled to merchant
  
  -- Fees
  conv_fee VARCHAR,                    -- Convenience fee
  gst_fee VARCHAR,                     -- GST on fees
  pipe_fee VARCHAR,                    -- Pipeline/processing fee
  
  -- Transaction Details
  transaction_mode VARCHAR,
  bank_name VARCHAR,
  currency VARCHAR,
  
  -- Dates
  trans_date DATE,                     -- Transaction date
  payment_date DATE,                   -- Settlement date
  
  -- Status
  transaction_status VARCHAR,
  payout_status BOOLEAN,               -- true = paid out
  
  -- Customer Details
  name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  
  -- Metadata
  company_domain VARCHAR,
  created_by VARCHAR,
  created_on TIMESTAMP
);
```

**Sample Data** (Staging):
```json
{
  "transaction_id": "394502306240980678",
  "gross_amount": 850,
  "net_amount": 850,
  "bank_name": "BOB",
  "trans_date": "2024-09-02",
  "payment_date": "2024-09-02",
  "payout_status": true
}
```

**Current Statistics**:
- Total records: **81**
- All records have `payout_status: true`
- Date range: August-September 2024
- Primary bank: **BOB** (Bank of Baroda)

---

## 📁 V1 File Format Standards

### **Based on `recon_configs` Analysis**

#### **Format 1: Standard CSV (Most Common)**

**Expected Columns** (from config "CSV"):
```csv
Txn_id,Gross_amount,Net_amount,Txn_date,Payment_date,Payment_bank
```

**Example**:
```csv
Txn_id,Gross_amount,Net_amount,Txn_date,Payment_date,Payment_bank
PG20240914001,125000.00,122500.00,2024-09-14,2024-09-15,AXIS
PG20240914002,89500.50,87550.00,2024-09-14,2024-09-15,HDFC
```

#### **Format 2: BOB Bank Specific (XLSX)**

**Expected Columns** (from config "bob sensitive"):
```
Merchant Track ID | TRANSACTION AMOUNT | net amouNT | transaction dATE | payment dATE | bob | onus indicator
```

**Key Characteristics**:
- **Case-insensitive** column matching
- Supports **XLSX** (Excel) files
- Bank-specific column names
- "onus indicator" for on-us transaction detection

#### **Format 3: Alternative CSV**

**Expected Columns** (from config "xlxs"):
```csv
Txn_id,Gross_amount,Net_amount,Payment_date,Txn_date,Payment_bank
```

**Note**: Similar to Format 1 but different date column order

---

## 🔍 V1 Reconciliation Logic (Inferred)

### **Matching Process**

Based on database schema and sample data:

1. **File Upload**:
   - User uploads CSV/XLSX file
   - System uses `recon_configs` to map columns
   - File data stored in `recon_upload`

2. **Data Parsing**:
   - Column headers matched against `recon_configs.{column_name}` mappings
   - Data inserted into `transaction_recon_table`
   - `is_recon_matched` initially set to `false`

3. **Matching Logic** (appears to be):
   ```sql
   UPDATE transaction_recon_table
   SET is_recon_matched = true
   WHERE transaction_id IN (
     -- Match by transaction_id + amount + date
     SELECT transaction_id 
     FROM transaction_recon_table
     GROUP BY transaction_id
     HAVING COUNT(*) = 2  -- Both PG and Bank record exist
   );
   ```

4. **Settlement**:
   - Matched transactions (`is_recon_matched = true`) moved to `settled_transactions`
   - `payout_status` set to `true` after settlement completion

### **Match Criteria** (Inferred):
- **Primary**: `transaction_id` (exact match)
- **Secondary**: `paid_amount` or `payee_amount` (amount validation)
- **Tertiary**: `payment_date` (date validation)

**Exception Handling**:
- No explicit exception table found
- Likely uses `is_recon_matched = false` flag
- `transaction_status != 'Completed'` indicates issues

---

## 🏦 Merchant Configuration

### **Table: `merchant_data`**

```sql
CREATE TABLE merchant_data (
  merchantid VARCHAR PRIMARY KEY,
  
  -- Basic Info
  name VARCHAR,
  email_id VARCHAR,
  contactnumber BIGINT,
  companyname VARCHAR,
  
  -- Client Details
  clientname VARCHAR,
  clientcode VARCHAR,                  -- IMPORTANT: Used in transactions
  client_id VARCHAR,
  client_type VARCHAR,
  
  -- Configuration
  status VARCHAR,
  merchant_type_id INTEGER,
  parent_id INTEGER,
  
  -- Financial Settings
  rolling_reserve BOOLEAN,             -- Reserve fund enabled?
  rolling_percentage DOUBLE PRECISION, -- Reserve percentage
  no_of_days INTEGER,                  -- Settlement days
  subscribe BOOLEAN,
  subscribe_amount DOUBLE PRECISION,
  pending_subscribe_amount NUMERIC,
  
  -- Metadata
  created_date TIMESTAMP,
  loginmasterid INTEGER
);
```

**Key Fields for V2 Integration**:
- `clientcode` - Used as merchant identifier (maps to V2 `merchant_id`)
- `rolling_reserve` - Reserve fund configuration
- `no_of_days` - Settlement cycle (T+N days)

---

## 📊 Data Relationships

```
┌─────────────────────┐
│   recon_upload      │
│  (File Tracking)    │
└──────────┬──────────┘
           │
           │ uses config
           ↓
┌─────────────────────┐
│   recon_configs     │
│  (Column Mapping)   │
└──────────┬──────────┘
           │
           │ maps to
           ↓
┌─────────────────────────┐
│ transaction_recon_table │
│  (Reconciliation Data)  │
└──────────┬──────────────┘
           │
           │ is_recon_matched = true
           ↓
┌─────────────────────────┐
│  settled_transactions   │
│   (Final Settlements)   │
└─────────────────────────┘
```

---

## 🔄 V1 to V2 Migration Mapping

### **Table Mapping**

| V1 Table | V2 Table | Notes |
|----------|----------|-------|
| `transaction_recon_table` | `sp_v2_transactions` | Core transaction data |
| `settled_transactions` | `sp_v2_settlement_items` | Settlement records |
| `recon_configs` | *Built-in normalizers* | V2 uses code-based column mapping |
| `recon_upload` | `sp_v2_file_uploads` | File tracking |
| `merchant_data` | `sp_v2_merchants` | Merchant master |

### **Column Mapping**

| V1 Column | V2 Column | Transform |
|-----------|-----------|-----------|
| `transaction_id` | `transaction_id` | Direct |
| `payee_amount` | `amount` | Direct (already in paise) |
| `paid_amount` | `net_amount` | Direct |
| `trans_date` | `transaction_date` | Format: YYYY-MM-DD |
| `payment_date` | `settlement_date` | Format: YYYY-MM-DD |
| `payment_bank` | `bank_name` | Direct |
| `is_recon_matched` | `status = 'RECONCILED'` | Boolean to enum |
| `company_domain` | `merchant_id` | Needs merchant lookup |

---

## 💡 Key Insights for V2 Development

### **1. Flexible Column Mapping is Critical**

V1's `recon_configs` table shows that **column names vary by merchant/bank**. V2 must support:
- Multiple column name variations
- Case-insensitive matching
- Both CSV and XLSX formats

### **2. Amount Handling**

- V1 stores amounts in **paise** (integer values like 4852 = ₹48.52)
- V2 should maintain this for precision
- `payee_amount` = gross, `paid_amount` = net after fees

### **3. Reconciliation Status**

V1 uses simple boolean:
```sql
is_recon_matched BOOLEAN  -- true = matched, false = unmatched
```

V2 has richer status:
```sql
status VARCHAR  -- 'RECONCILED', 'EXCEPTION', 'PENDING'
```

### **4. Settlement Flow**

V1 Process:
```
Upload File → Parse with Config → Match by TxnID → Mark Matched → Settle → Payout
```

V2 Should Improve:
```
Upload File → Auto-detect Format → Multi-criteria Match → Exception Handling → Settlement Batch → Payout
```

---

## 🚀 Recommended V2 Enhancements

### **1. Add V1 Column Name Support**

Update `normalizeTransactions()` to support V1 column names:

```javascript
transaction_id: 
  t['Transaction ID'] ||     // V2 format
  t.transaction_id ||        // V1 format (lowercase)
  t['Txn_id'] ||            // V1 config variation
  t['mErchant tRack ID'] || // V1 BOB format
  ''
```

### **2. Config-Based Column Mapping**

Add a `column_mappings` table similar to V1's `recon_configs`:

```sql
CREATE TABLE sp_v2_column_mappings (
  id SERIAL PRIMARY KEY,
  config_name VARCHAR,
  merchant_id VARCHAR,
  bank_name VARCHAR,
  
  -- Column mappings (actual CSV header → field name)
  txn_id_column VARCHAR,      -- e.g., "Txn_id", "Transaction ID"
  amount_column VARCHAR,       -- e.g., "Gross_amount", "Amount"
  utr_column VARCHAR,          -- e.g., "UTR", "Reference No"
  date_column VARCHAR          -- e.g., "Txn_date", "Transaction Date"
);
```

### **3. Support XLSX Files**

V1 supports Excel files. V2 should add XLSX parsing:

```javascript
import * as XLSX from 'xlsx';

function parseXLSX(file) {
  const workbook = XLSX.read(file, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}
```

### **4. Merchant-Specific Configurations**

Link column mappings to merchants for automatic format detection:

```javascript
const merchantConfig = await getMerchantColumnMapping(merchantId);
const normalizedData = applyColumnMapping(rawData, merchantConfig);
```

---

## 📞 Database Connection Details

**Staging Database**:
```
Host: 3.108.237.99
Port: 5432
Database: settlepaisa
User: settlepaisainternal
Password: sabpaisa123
```

**Connection String**:
```
postgresql://settlepaisainternal:sabpaisa123@3.108.237.99:5432/settlepaisa
```

---

## 📚 Reference Queries

### **Get All Reconciliation Configs**:
```sql
SELECT config_name, file_type, 
       transaction_id, paid_amount, payee_amount,
       transaction_date_time, payment_date_time, bank_name
FROM recon_configs
ORDER BY created_on DESC;
```

### **Get Unmatched Transactions**:
```sql
SELECT transaction_id, paid_amount, payee_amount, 
       payment_date, transaction_status
FROM transaction_recon_table
WHERE is_recon_matched = false
ORDER BY created_on DESC;
```

### **Get Settlement Summary**:
```sql
SELECT 
  bank_name,
  COUNT(*) as txn_count,
  SUM(gross_amount) as total_gross,
  SUM(net_amount) as total_net
FROM settled_transactions
WHERE payout_status = true
GROUP BY bank_name;
```

---

## ✅ Summary

**SettlePaisa V1** is a flexible reconciliation system with:

✅ **Configurable column mapping** per merchant/bank  
✅ **CSV and XLSX** file support  
✅ **Simple boolean matching** (is_recon_matched)  
✅ **89 reconciliation records** in staging  
✅ **81 settled transactions** with payout status  

**For V2 Compatibility**:
- ✅ Add V1 column name variations to normalizers
- ✅ Support flexible column mapping like `recon_configs`
- ✅ Add XLSX file parsing
- ✅ Migrate `is_recon_matched` boolean to `status` enum

---

## 🔍 SettlePaisa 2.0 Reconciliation Logic Analysis

### **Overview**
SettlePaisa 2.0 uses a sophisticated Java/Spring Boot reconciliation service with multiple matching strategies. The code was analyzed from `/Users/shantanusingh/settlepaisa/services/recon-service/`.

### **Architecture Components**

#### **1. Matching Engine** (`MatchingEngine.java`)

**Core Flow**:
```java
// Ordered strategies - short-circuit on first match
private final List<MatchStrategy> strategies = List.of(
    new UtrExactStrategy(),           // 1st: Exact UTR match
    new UtrAmountTimeStrategy(),      // 2nd: UTR + Amount + Time
    new RrnAmountStrategy(),          // 3rd: RRN + Amount
    new HeuristicStrategy()           // 4th: Fuzzy matching
);
```

**Matching Process**:
1. Check if row already matched (idempotency)
2. Try each strategy in order (short-circuit on success)
3. Calculate confidence score for match
4. Create `ReconMatch` or `ReconException` record
5. Record metrics (Prometheus)

**Key Features**:
- ✅ **Amount tolerance**: ₹1 (100 paise) difference allowed
- ✅ **Time delta tracking**: Records time difference between PG and bank timestamps
- ✅ **Confidence scoring**: BigDecimal precision (0.00 to 1.00)
- ✅ **Audit trail**: Complete state tracking for compliance
- ✅ **SLA deadlines**: Auto-calculated based on exception severity

#### **2. UTR Exact Strategy** (`UtrExactStrategy.java`)

**Algorithm**:
```java
1. Normalize UTR: trim() and toUpperCase()
2. Query: repo.findByUtr(utr)
3. Validate amount delta ≤ 100 paise (₹1)
4. Return match or reject
```

**Amount Validation**:
```java
long amountDelta = Math.abs(normRow.getAmountPaise() - txn.getAmountPaise());
if (amountDelta > 100) { // More than ₹1 difference
    log.warn("UTR {} matched but amount mismatch", utr);
    return Optional.empty();  // REJECT match
}
```

**Key Insight**: V2 **rejects** matches with >₹1 amount difference, unlike our current V2 implementation which creates exceptions.

#### **3. Normalization Engine**

**File Processing**:
1. **Upload**: Multipart file upload with checksum validation (MD5/SHA256)
2. **Storage**: S3 with SSE-KMS encryption
3. **Mapping**: Reusable templates via `recon_mapping_template` table
4. **Transform**: Apply field transforms (see below)
5. **Normalize**: Convert to canonical schema

**Available Transforms**:
| Transform | Purpose | Example |
|-----------|---------|---------|
| `rupees_to_paise` | Convert ₹ to paise (BigDecimal) | 100.50 → 10050 |
| `paise_to_rupees` | Convert paise to ₹ | 10050 → 100.50 |
| `trim` | Remove whitespace | " UTR123 " → "UTR123" |
| `upper` / `lower` | Case conversion | "utr123" → "UTR123" |
| `strip_non_numeric` | Remove non-digits | "₹1,000.50" → "1000.50" |
| `parse_date` | Parse with format/timezone | "01/01/2024" → ISO timestamp |
| `map_values` | Dictionary mapping | "S" → "SUCCESS" |
| `concat` | Combine fields | [bank, utr] → "HDFC_UTR123" |
| `constant` | Set fixed value | → "INR" |
| `calculate_gst` | 18% GST calculation | 1000 → 180 |
| `apply_percentage` | Apply % calculation | 1000 * 2.5% → 25 |

#### **4. Canonical Output Schema**

**V2 Standard Format**:
```csv
utr,amount_paise,currency,txn_at,merchant_ref,acquirer_ref,status_code,auth_code
HDFC2024010112345,100000,INR,2024-01-01T10:30:00Z,ORD123,ACQ456,SUCCESS,AUTH789
```

**Database Tables** (Append-Only):
```sql
-- Raw ingested data (original format)
recon_row_raw (
  id UUID,
  recon_file_id UUID,
  row_number INT,
  raw_data JSONB           -- Original CSV row as JSON
)

-- Normalized canonical data
recon_row_norm (
  id UUID,
  recon_file_id UUID,
  utr VARCHAR,
  amount_paise BIGINT,      -- Always in paise (no decimals!)
  currency VARCHAR(3),
  txn_at TIMESTAMP WITH TIME ZONE,
  merchant_ref VARCHAR,
  acquirer_ref VARCHAR,
  status_code VARCHAR,
  auth_code VARCHAR
)

-- Match records
recon_match (
  id UUID,
  norm_row_id UUID,
  gateway_txn_id UUID,
  match_type VARCHAR,       -- UTR_EXACT, UTR_AMOUNT_TIME, etc.
  confidence DECIMAL(5,4),  -- 0.0000 to 1.0000
  amount_delta_paise BIGINT,
  time_delta_seconds BIGINT,
  matched_by VARCHAR,
  matched_at TIMESTAMP
)

-- Exception records
recon_exception (
  id UUID,
  norm_row_id UUID,
  code VARCHAR,             -- MISSING_GATEWAY_TXN, AMOUNT_MISMATCH, etc.
  severity VARCHAR,         -- CRITICAL, ERROR, WARN, INFO
  state VARCHAR,            -- OPEN, IN_PROGRESS, RESOLVED, CLOSED
  sla_deadline TIMESTAMP,   -- Auto-calculated based on severity
  details JSONB
)
```

#### **5. Money Math - CRITICAL**

**V2 Standard** (BigDecimal only):
```java
// ✅ CORRECT: Use BigDecimal with HALF_EVEN rounding
BigDecimal rupees = new BigDecimal("100.50");
BigDecimal paise = rupees.multiply(new BigDecimal("100"))
    .setScale(0, RoundingMode.HALF_EVEN);
long amountPaise = paise.longValue(); // 10050

// ❌ NEVER DO THIS:
double amount = 100.50;  // WRONG - loses precision
long paise = (long)(amount * 100);  // WRONG - rounding errors
```

**Why BigDecimal**:
- Float/double have precision errors (0.1 + 0.2 ≠ 0.3)
- Financial calculations require exact decimal arithmetic
- RBI compliance requires accurate money handling

#### **6. Mapping Templates** (Flexible Column Mapping)

**V2 Implementation**:
```json
{
  "acquirer": "HDFC",
  "fileType": "NEFT",
  "delimiter": ",",
  "headerRows": 1,
  "dateFormat": "yyyy-MM-dd",
  "timezone": "Asia/Kolkata",
  "columnMappings": {
    "utr": {
      "sourceColumn": "UTR",           // CSV header name
      "targetColumn": "utr",           // Canonical field
      "required": true
    },
    "amount": {
      "sourceColumn": "Amount",
      "targetColumn": "amount",
      "required": true
    },
    "transaction_date": {
      "sourceColumn": "Transaction Date",
      "targetColumn": "txn_at",
      "required": true
    }
  },
  "transforms": [
    {
      "type": "rupees_to_paise",
      "field": "amount"
    },
    {
      "type": "parse_date",
      "field": "transaction_date",
      "params": {
        "format": "yyyy-MM-dd",
        "timezone": "Asia/Kolkata"
      }
    }
  ]
}
```

**Database Storage**:
```sql
CREATE TABLE recon_mapping_template (
  id UUID PRIMARY KEY,
  acquirer VARCHAR NOT NULL,
  file_type VARCHAR NOT NULL,
  is_default BOOLEAN DEFAULT false,
  config JSONB NOT NULL,          -- Full mapping config as JSON
  created_by VARCHAR,
  created_at TIMESTAMP,
  version INT DEFAULT 1
);
```

### **Comparison: V1 vs V2 Reconciliation**

| Feature | V1 (Staging DB) | V2 (SettlePaisa 2.0) | Current V2 Ops Dashboard |
|---------|-----------------|----------------------|--------------------------|
| **Column Mapping** | `recon_configs` table | `recon_mapping_template` table | ❌ Hardcoded column names |
| **File Formats** | CSV, XLSX | CSV, XLSX | ✅ CSV only |
| **Amount Storage** | Mixed (rupees) | **Paise only (BigDecimal)** | ❌ Rupees (Number) |
| **Matching Strategy** | Single UTR match | **4 strategies (UTR, RRN, Heuristic)** | ✅ UTR only |
| **Amount Tolerance** | Unknown | ₹1 (100 paise) | ✅ ₹0.01 |
| **Exception Handling** | `is_recon_matched` flag | **SLA-based severity system** | ✅ Basic (reason code) |
| **Audit Trail** | Import logs | **Complete audit journal** | ❌ None |
| **Confidence Scoring** | None | ✅ 0.0000-1.0000 | ❌ None |
| **Normalization** | Manual | **Transform pipeline** | ❌ Basic mapping |
| **Storage** | Direct DB | S3 + DB | ❌ Direct DB |
| **Encryption** | Encrypted URLs | SSE-KMS | ❌ None |

### **Key Takeaways for V2 Ops Dashboard Migration**

#### **Critical Improvements Needed**:

1. **✅ Flexible Column Mapping**
   - Add `recon_mapping_template` table
   - Support V1 column names: `Txn_id`, `Gross_amount`, `Net_amount`, etc.
   - Allow per-merchant/bank configurations

2. **✅ Money Math Precision**
   - Change from `Number` to `BigDecimal` equivalent
   - Store amounts in **paise only** (no decimals)
   - Use proper rounding (HALF_EVEN)

3. **✅ Multi-Strategy Matching**
   - Currently: UTR-only matching
   - Add: RRN matching, Time-based matching, Fuzzy matching
   - Implement confidence scoring

4. **✅ Exception Management**
   - Current: Simple exception array
   - Target: SLA-based workflow (OPEN → IN_PROGRESS → RESOLVED)
   - Add severity levels (CRITICAL, ERROR, WARN, INFO)

5. **✅ Transform Pipeline**
   - Add `rupees_to_paise` transform
   - Add date parsing with timezone support
   - Add case normalization (UTR uppercase)

6. **✅ File Format Support**
   - Current: CSV only
   - Add: XLSX support
   - Add: Checksum validation (MD5/SHA256)

### **Recommended Migration Path**

**Phase 1: Basic V1 Compatibility**
```javascript
// Add V1 column name variations to normalization
const V1_COLUMN_MAPPINGS = {
  'transaction_id': ['Txn_id', 'TXN_ID', 'transaction_id'],
  'amount': ['Gross_amount', 'Net_amount', 'paid_amount', 'Amount'],
  'merchant_id': ['client_code', 'CLIENT_CODE', 'Merchant ID'],
  'utr': ['UTR', 'utr', 'BankRefNo'],
  'payment_mode': ['payment_mode', 'PAYMENT_MODE', 'Payment Method']
};
```

**Phase 2: Transform Pipeline**
```javascript
const transforms = [
  { type: 'trim', field: 'utr' },
  { type: 'upper', field: 'utr' },
  { type: 'rupees_to_paise', field: 'amount' },
  { type: 'parse_date', field: 'transaction_date', format: 'YYYY-MM-DD' }
];
```

**Phase 3: Multi-Strategy Matching**
```javascript
const strategies = [
  new UtrExactStrategy(),
  new UtrAmountStrategy({ tolerance: 100 }), // ₹1 tolerance
  new RrnAmountStrategy()
];
```

**Phase 4: Exception Workflow**
```sql
ALTER TABLE sp_v2_exceptions 
  ADD COLUMN severity VARCHAR DEFAULT 'ERROR',
  ADD COLUMN state VARCHAR DEFAULT 'OPEN',
  ADD COLUMN sla_deadline TIMESTAMP;
```

---

**Document Version**: 1.1  
**Last Updated**: October 2, 2025  
**Analyzed By**: Claude Code Assistant  
**Code Analyzed**: SettlePaisa 2.0 Recon Service (Java/Spring Boot)
