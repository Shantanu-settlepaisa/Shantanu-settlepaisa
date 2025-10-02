# Table Mapping: Manual Upload vs Connectors vs Analytics

**Date:** October 2, 2025  
**Question:** Which tables are updated in each scenario?

---

## 📋 Quick Answer

| Scenario | Tables Updated | Data Source |
|----------|---------------|-------------|
| **Manual Upload** | `sp_v2_transactions` | CSV files uploaded by ops team |
| **Connectors (SFTP)** | `ingested_files` → `sp_v2_bank_files` → `sp_v2_transactions` | SFTP auto-download |
| **Connectors (PG API)** | `sp_v2_transactions_v1` | Webhook/API calls |
| **Connectors (Streaming)** | `sp_v2_transactions` | Debezium → Kafka → Flink |
| **Analytics** | Reads from: `sp_v2_transactions` + `sp_v2_settlement_batches` + `sp_v2_settlement_items` | Query only, no updates |

---

## 🎯 Scenario 1: Manual Upload (Current - Working)

### **What Happens:**

```
User uploads CSV file → System processes → Inserts into database
```

### **Tables Updated:**

#### **Primary Table: `sp_v2_transactions`**

```sql
CREATE TABLE sp_v2_transactions (
  id                      BIGSERIAL PRIMARY KEY,
  transaction_id          VARCHAR(100) UNIQUE,
  merchant_id             VARCHAR(50),
  amount_paise            BIGINT,
  payment_method          VARCHAR(50),
  transaction_date        DATE,
  source_type             VARCHAR(50),      -- 'MANUAL_UPLOAD'
  source_name             VARCHAR(200),     -- 'bank_statement.csv'
  status                  VARCHAR(50),      -- 'RECONCILED', 'PENDING'
  settlement_batch_id     UUID,
  created_at              TIMESTAMPTZ
);
```

### **Example Data After Manual Upload:**

```sql
-- You upload: HDFC_Statement_Oct2.csv (1,500 rows)

INSERT INTO sp_v2_transactions VALUES
  (1, 'TXN001', 'MERCH001', 500000, 'UPI', '2025-10-02', 'MANUAL_UPLOAD', 'HDFC_Statement_Oct2.csv', 'RECONCILED', NULL, NOW()),
  (2, 'TXN002', 'MERCH001', 300000, 'CARD', '2025-10-02', 'MANUAL_UPLOAD', 'HDFC_Statement_Oct2.csv', 'RECONCILED', NULL, NOW()),
  (3, 'TXN003', 'MERCH002', 200000, 'NETBANKING', '2025-10-02', 'MANUAL_UPLOAD', 'HDFC_Statement_Oct2.csv', 'RECONCILED', NULL, NOW());
  -- ... 1,497 more rows
```

### **Current Data:**

```
sp_v2_transactions:
├─ Source: MANUAL_UPLOAD/MANUAL_UPLOAD → 702 txns
├─ Source: MANUAL_UPLOAD/pg_data_20240929.csv → 3 txns
└─ Source: MANUAL_UPLOAD/TEST_SOURCE → 1 txn

Total: 706 transactions (all manual uploads)
```

---

## 🔌 Scenario 2: Connectors - SFTP (Future - When Bank Credentials Come)

### **What Happens:**

```
Bank uploads file to SFTP → Connector polls every 60s → Downloads → Processes → Inserts
```

### **Tables Updated (in order):**

#### **Step 1: File Tracking → `ingested_files`**

```sql
CREATE TABLE ingested_files (
  id               BIGSERIAL PRIMARY KEY,
  bank             TEXT,                  -- 'HDFC'
  remote_path      TEXT,                  -- '/outbound/settlement/HDFC_SETTLE_2025-10-02.csv'
  filename         TEXT,                  -- 'HDFC_SETTLE_2025-10-02.csv'
  business_date    DATE,                  -- '2025-10-02'
  size_bytes       BIGINT,                -- 245678
  downloaded_at    TIMESTAMPTZ,           -- When connector downloaded
  status           TEXT,                  -- 'DOWNLOADED', 'VALIDATED', 'COMPLETE'
  created_at       TIMESTAMPTZ
);
```

**Example:**
```sql
INSERT INTO ingested_files VALUES
  (1, 'HDFC', '/outbound/settlement/HDFC_SETTLE_2025-10-02.csv', 
   'HDFC_SETTLE_2025-10-02.csv', '2025-10-02', 245678, 
   '2025-10-02 15:01:30', 'COMPLETE', '2025-10-02 15:01:25');
```

#### **Step 2: File Registry → `sp_v2_bank_files`**

```sql
CREATE TABLE sp_v2_bank_files (
  id               BIGSERIAL PRIMARY KEY,
  bank_name        VARCHAR(50),           -- 'HDFC'
  file_name        VARCHAR(200),          -- 'HDFC_SETTLE_2025-10-02.csv'
  file_date        DATE,                  -- '2025-10-02'
  total_rows       INTEGER,               -- 1500
  total_amount     BIGINT,                -- 4567890 (paise)
  processed        BOOLEAN,               -- true
  created_at       TIMESTAMPTZ
);
```

**Example:**
```sql
INSERT INTO sp_v2_bank_files VALUES
  (1, 'HDFC', 'HDFC_SETTLE_2025-10-02.csv', '2025-10-02', 
   1500, 456789000, true, '2025-10-02 15:02:00');
```

#### **Step 3: Transaction Data → `sp_v2_transactions`**

```sql
-- Same table as manual upload, but source_type is different

INSERT INTO sp_v2_transactions VALUES
  (1001, 'TXN1001', 'KAPR63', 500000, 'UPI', '2025-10-02', 
   'SFTP_CONNECTOR',                    -- Different source!
   'HDFC_SETTLE_2025-10-02.csv',       -- Source file
   'RECONCILED', NULL, NOW());
```

---

## 🔌 Scenario 3: Connectors - Payment Gateway Webhooks (Already Built)

### **What Happens:**

```
Razorpay transaction happens → Razorpay sends webhook → Our server receives → Inserts
```

### **Table Updated: `sp_v2_transactions_v1`**

```sql
CREATE TABLE sp_v2_transactions_v1 (
  id               BIGSERIAL PRIMARY KEY,
  merchant_id      VARCHAR(50),
  pgw_ref          VARCHAR(100),          -- Payment gateway reference
  amount_paise     BIGINT,
  utr              VARCHAR(50),
  payment_mode     VARCHAR(50),
  status           VARCHAR(50),
  gateway          VARCHAR(50),           -- 'razorpay', 'payu', 'paytm'
  gateway_txn_id   VARCHAR(100),
  created_at       TIMESTAMPTZ
);
```

**Example:**
```sql
-- Razorpay webhook received
INSERT INTO sp_v2_transactions_v1 VALUES
  (1, 'KAPR63', 'pay_ABC123', 500000, 'UTR123456', 
   'UPI', 'captured', 'razorpay', 'pay_ABC123', NOW());
```

**Note:** This is a **different table** than manual upload (`sp_v2_transactions_v1` vs `sp_v2_transactions`)

---

## 🔌 Scenario 4: Connectors - Streaming (Future - Debezium + Kafka + Flink)

### **What Happens:**

```
SabPaisa DB transaction INSERT → Debezium captures → Kafka event → Flink enriches → Inserts
```

### **Table Updated: `sp_v2_transactions`** (same as manual upload!)

```sql
-- But source_type indicates streaming
INSERT INTO sp_v2_transactions VALUES
  (5001, 'TXN5001', 'KAPR63', 500000, 'UPI', '2025-10-02',
   'SABPAISA_STREAM',                   -- Streaming source!
   'debezium_cdc',
   'RECONCILED', NULL, NOW());
```

### **Why Same Table?**

Because **it doesn't matter** where data came from:
- Manual upload → `sp_v2_transactions`
- SFTP connector → `sp_v2_transactions`
- Streaming → `sp_v2_transactions`

All transaction data goes to **same table**, just different `source_type`:
- `MANUAL_UPLOAD`
- `SFTP_CONNECTOR`
- `SABPAISA_STREAM`
- `PG_WEBHOOK`

---

## 📊 Scenario 5: Analytics Dashboard

### **Tables Analytics READS (No Updates):**

Analytics **only queries**, never updates. It reads from:

#### **1. Transaction Data:**
```sql
sp_v2_transactions
├─ All transactions (manual + connector + streaming)
└─ Used for: Unsettled count, GMV trends, payment mode breakdown
```

#### **2. Settlement Data:**
```sql
sp_v2_settlement_batches
├─ Settlement batch summary
└─ Used for: Settled count, settlement rate, batch status

sp_v2_settlement_items
├─ Individual transaction settlements
└─ Used for: Payment mode breakdown (settled), commission totals
```

#### **3. Supporting Data:**
```sql
sp_v2_bank_transfer_queue
├─ Bank transfer status
└─ Used for: Paid out count (funnel)

sp_v2_rolling_reserve_ledger
├─ Reserve tracking
└─ Used for: Reserve amounts

sp_v2_exceptions
├─ Exception tracking
└─ Used for: Failure analysis
```

---

## 🎯 Complete Flow Example

### **Scenario: HDFC Bank File Processing**

```
Day 1: 3:00 PM
├─ HDFC uploads file to SFTP server
│   File: HDFC_SETTLE_2025-10-02.csv
│   Contains: 1,500 transactions, ₹45 lakhs

Day 1: 3:01 PM (Connector Running)
├─ Connector polls SFTP server
├─ Finds new file: HDFC_SETTLE_2025-10-02.csv
├─ Downloads to staging
│
│   UPDATE ingested_files:
│   ├─ bank: 'HDFC'
│   ├─ filename: 'HDFC_SETTLE_2025-10-02.csv'
│   ├─ status: 'DOWNLOADED'
│   └─ downloaded_at: '2025-10-02 15:01:30'

Day 1: 3:02 PM (Processing)
├─ Validates file (checks size, header)
├─ Parses CSV (1,500 rows)
│
│   UPDATE ingested_files:
│   └─ status: 'VALIDATED'
│
│   INSERT INTO sp_v2_bank_files:
│   ├─ bank_name: 'HDFC'
│   ├─ file_name: 'HDFC_SETTLE_2025-10-02.csv'
│   ├─ total_rows: 1500
│   └─ total_amount: 4500000000 (₹45L in paise)
│
│   INSERT INTO sp_v2_transactions (1,500 rows):
│   ├─ Row 1: TXN1001, KAPR63, ₹5000, UPI, 'SFTP_CONNECTOR'
│   ├─ Row 2: TXN1002, KAPR63, ₹3000, CARD, 'SFTP_CONNECTOR'
│   └─ ... 1,498 more rows
│
│   UPDATE ingested_files:
│   └─ status: 'COMPLETE'

Day 1: 3:03 PM (User Opens Analytics)
├─ User: http://localhost:5174/ops/analytics
├─ Analytics API queries:
│
│   SELECT COUNT(*), SUM(amount_paise)
│   FROM sp_v2_transactions
│   WHERE source_type = 'SFTP_CONNECTOR'
│     AND DATE(created_at) = CURRENT_DATE
│
│   Result: 1,500 txns, ₹45,00,000
│
└─ Dashboard displays:
    ┌─────────────────────────────┐
    │ Unsettled Transactions      │
    │        1,500                │
    │     ₹45,00,000              │
    │   From HDFC SFTP            │
    └─────────────────────────────┘
```

---

## 📋 Summary Table

| Scenario | Primary Table | Source Type Value | Additional Tables |
|----------|---------------|------------------|-------------------|
| **Manual Upload** | `sp_v2_transactions` | `MANUAL_UPLOAD` | None |
| **SFTP Connector** | `sp_v2_transactions` | `SFTP_CONNECTOR` | `ingested_files`, `sp_v2_bank_files` |
| **PG Webhook** | `sp_v2_transactions_v1` | N/A | None |
| **Streaming (Future)** | `sp_v2_transactions` | `SABPAISA_STREAM` | None (Kafka/Flink in between) |
| **Analytics** | Reads all above | All sources | `sp_v2_settlement_batches`, `sp_v2_settlement_items` |

---

## 🎯 Key Points

### **1. Core Transaction Table:**
```
sp_v2_transactions = Universal transaction table
├─ Accepts data from ANY source
├─ source_type distinguishes origin
└─ All analytics query this table
```

### **2. Connector Metadata Tables:**
```
ingested_files = Track SFTP downloads
sp_v2_bank_files = File-level summary
sp_v2_connector_sync_history = Sync logs
```

### **3. Settlement Tables:**
```
sp_v2_settlement_batches = Settlement summary
sp_v2_settlement_items = Settlement line items
sp_v2_bank_transfer_queue = Payment status
```

### **4. Analytics Queries:**
```sql
-- Settled transactions
SELECT * FROM sp_v2_settlement_items;

-- Unsettled transactions
SELECT * FROM sp_v2_transactions 
WHERE settlement_batch_id IS NULL;

-- Payment mode breakdown
SELECT payment_method, COUNT(*) 
FROM sp_v2_transactions 
GROUP BY payment_method;
```

---

## ✅ Direct Answer to Your Question

**Q: Which table gets updated during manual upload?**  
**A:** `sp_v2_transactions` with `source_type = 'MANUAL_UPLOAD'`

**Q: Which tables get updated when connectors stream data?**  
**A:** 
- SFTP: `ingested_files` → `sp_v2_bank_files` → `sp_v2_transactions`
- Streaming: `sp_v2_transactions` (via Kafka → Flink)

**Q: Which tables power analytics?**  
**A:** 
- `sp_v2_transactions` (all transaction data)
- `sp_v2_settlement_batches` (settlement summary)
- `sp_v2_settlement_items` (settlement details)
- `sp_v2_bank_transfer_queue` (payment status)

**All data sources feed into the SAME core table (`sp_v2_transactions`), so analytics doesn't care where data came from!**
