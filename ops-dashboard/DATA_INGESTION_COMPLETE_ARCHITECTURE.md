# Complete Data Ingestion Architecture
## Current State + Future Streaming (Debezium + Kafka + Flink)

**Date:** October 2, 2025  
**Status:** ✅ Foundation Ready, 🚧 Streaming Pipeline Planned

---

## 🎯 Executive Summary

You have **ALREADY built** the foundation for streaming architecture:

✅ **Kafka Infrastructure** - Docker Compose ready  
✅ **SFTP Bank Ingestion** - Automated bank file polling  
✅ **PG Ingestion API** - Webhook-based transaction ingestion  
✅ **SabPaisa Connector** - Direct DB access for transactions  
⏳ **Debezium CDC** - NOT YET SETUP  
⏳ **Apache Flink** - NOT YET SETUP  

---

## 📊 Current Data Ingestion Flows (ALREADY WORKING)

### **Flow 1: SFTP Bank File Ingestion** ✅

```
Bank SFTP Servers
    ↓ (Poll every 60s)
SFTP Watcher Service (Port 5106)
    ├─ AXIS: 3 cutoffs (11:30, 15:30, 20:00)
    ├─ HDFC: 4 cutoffs (10:00, 14:00, 18:00, 22:00)
    └─ ICICI: 2 cutoffs (09:30, 21:30)
    ↓ (Download & Validate)
Staging Directory (/tmp/sftp-staging)
    ↓ (Parse CSV)
sp_v2_bank_files_ingested (tracking)
sp_v2_bank_file_expectations (expected vs received)
    ↓ (Insert data)
sp_v2_transactions (bank data)
```

**Tables Created:**
```sql
-- Migration: 003_create_ingestion_tables.sql
sp_v2_bank_configs              -- Bank SFTP configurations
sp_v2_bank_files_ingested       -- Downloaded file tracking
sp_v2_bank_file_expectations    -- Expected files per cutoff
sp_v2_sftp_connector_health     -- Health status
```

**Status:** ✅ Fully implemented, waiting for bank SFTP credentials

---

### **Flow 2: PG Gateway Webhook Ingestion** ✅

```
Payment Gateway APIs (Razorpay, PayU, Paytm)
    ↓ (Webhook POST)
PG Ingestion Server (Port 5111)
    ├─ /webhook/razorpay
    ├─ /webhook/payu
    └─ /webhook/paytm
    ↓ (Validate signature)
Deduplication Check (in-memory Set)
    ↓ (Insert if unique)
sp_v2_transactions_v1 (PG transaction data)
```

**Features:**
- Webhook signature validation
- Rate limiting (1000 req/min)
- Deduplication (prevent double processing)
- Scheduled polling fallback (every 5 minutes)

**Status:** ✅ Fully implemented, can receive webhooks

---

### **Flow 3: SabPaisa Direct Connector** ✅

```
SabPaisa Core DB (3.108.237.99:5432)
    ↓ (Direct SQL Query)
SabPaisa Connector Service
    ├─ fetchPGTransactions(cycleDate)
    ├─ fetchBankStatements(cycleDate)
    └─ fetchMerchantData()
    ↓ (Transform)
V2 Database (settlement analytics queries)
```

**Status:** ✅ Used for merchant config sync, can query transactions

---

## 🚀 Future: Streaming Architecture (Debezium + Kafka + Flink)

### **Why Add Streaming When You Have Ingestion?**

**Current Limitations:**
1. ❌ **SFTP is Batch** - Files arrive hourly, not real-time
2. ❌ **Webhooks are Unreliable** - Can miss, fail, or arrive late
3. ❌ **Polling is Wasteful** - Repeatedly query same data
4. ❌ **No Historical Replay** - Can't reprocess past events
5. ❌ **Single Consumer** - Only one service can process

**Streaming Benefits:**
1. ✅ **Real-Time CDC** - Capture every DB change (< 1s lag)
2. ✅ **Guaranteed Delivery** - Kafka persistence & replay
3. ✅ **Multi-Consumer** - Analytics, ML, Alerts all consume same stream
4. ✅ **Transform Layer** - Flink enriches/aggregates before storage
5. ✅ **Event Sourcing** - Complete audit trail of all changes

---

## 🏗️ Complete Future Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   DATA SOURCES                              │
├─────────────────────────────────────────────────────────────┤
│ 1. SabPaisa Core DB (PostgreSQL)                            │
│    • transactions_to_settle (millions of rows)              │
│    • merchant_data (15K merchants)                          │
│    • payment_gateway_response                               │
│                                                             │
│ 2. Bank SFTP Servers                                        │
│    • AXIS (3 cutoffs/day)                                   │
│    • HDFC (4 cutoffs/day)                                   │
│    • ICICI (2 cutoffs/day)                                  │
│                                                             │
│ 3. PG Gateway APIs                                          │
│    • Razorpay webhooks                                      │
│    • PayU webhooks                                          │
│    • Paytm webhooks                                         │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                   INGESTION LAYER                           │
├─────────────────────────────────────────────────────────────┤
│ A. CDC (Change Data Capture) - NEW                         │
│    ┌────────────────────────────────────────────────────┐  │
│    │  Debezium PostgreSQL Connector                     │  │
│    │  • Reads PostgreSQL WAL (Write-Ahead Log)          │  │
│    │  • Captures INSERT/UPDATE/DELETE                   │  │
│    │  • Converts to Kafka events                        │  │
│    └────────────────────────────────────────────────────┘  │
│                                                             │
│ B. File Ingestion - EXISTING ✅                             │
│    ┌────────────────────────────────────────────────────┐  │
│    │  SFTP Watcher (Port 5106)                          │  │
│    │  • Polls bank SFTP every 60s                       │  │
│    │  • Downloads files                                 │  │
│    │  • Publishes to Kafka: bank.files.received        │  │
│    └────────────────────────────────────────────────────┘  │
│                                                             │
│ C. API Ingestion - EXISTING ✅                              │
│    ┌────────────────────────────────────────────────────┐  │
│    │  PG Webhook Server (Port 5111)                     │  │
│    │  • Receives PG webhooks                            │  │
│    │  • Validates signatures                            │  │
│    │  • Publishes to Kafka: pg.transactions            │  │
│    └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│              APACHE KAFKA (Event Streaming)                 │
├─────────────────────────────────────────────────────────────┤
│ Topics (Already configured ✅):                             │
│  • recon.jobs                                               │
│  • recon.results                                            │
│  • payment.events                                           │
│                                                             │
│ Topics (NEW for streaming):                                 │
│  • sabpaisa.public.transactions_to_settle (Debezium CDC)    │
│  • sabpaisa.public.merchant_data (Debezium CDC)             │
│  • bank.files.received (SFTP watcher)                       │
│  • pg.transactions (PG webhooks)                            │
│  • settlement.batches.created (V2 events)                   │
│  • settlement.batches.approved (V2 events)                  │
│                                                             │
│ Infrastructure (Docker Compose):                            │
│  ✅ Zookeeper (Port 2181)                                   │
│  ✅ Kafka Broker (Port 9092)                                │
│  ✅ Kafka UI (Port 8090)                                    │
│  ⏳ Kafka Connect (for Debezium) - Need to add             │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         APACHE FLINK (Stream Processing) - NEW              │
├─────────────────────────────────────────────────────────────┤
│ Job 1: Transaction Enrichment                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Input:  sabpaisa.transactions (raw)                  │   │
│  │ Join:   merchant_master (dimension table)            │   │
│  │ Enrich: Add merchant name, settlement cycle          │   │
│  │ Output: enriched.transactions → V2 DB               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│ Job 2: Real-Time Aggregates                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Window: Tumbling 1-hour                              │   │
│  │ Compute: GMV, transaction count, settlement rate     │   │
│  │ Output: sp_v2_realtime_aggregates (materialized)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│ Job 3: Reconciliation Matcher                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Join: PG transactions + Bank files (by UTR)          │   │
│  │ Match: Amount, date, merchant                        │   │
│  │ Output: recon.matched / recon.unmatched             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│ Job 4: Settlement Trigger                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Rule: If T+settlement_cycle days passed              │   │
│  │ Trigger: settlement.jobs.pending                     │   │
│  │ Action: Call settlement calculator V3                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│              STORAGE LAYER (V2 Database)                    │
├─────────────────────────────────────────────────────────────┤
│ Tables:                                                     │
│  • sp_v2_transactions (enriched from Flink)                 │
│  • sp_v2_settlement_batches (settlement results)            │
│  • sp_v2_realtime_aggregates (materialized views)           │
│  • sp_v2_reconciliation_status (match results)              │
│  • sp_v2_bank_files_ingested (SFTP tracking)                │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│                   CONSUMERS                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Settlement Analytics API (Port 5107) - Fast queries     │
│ 2. Real-Time Alerts Service - Anomaly detection            │
│ 3. Data Warehouse Sync - Snowflake/BigQuery                │
│ 4. ML Feature Store - Model training                        │
│ 5. Audit Trail Service - Compliance reporting               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 How Debezium Works (Your Question)

### **Debezium = Change Data Capture (CDC)**

```
┌─────────────────────────────────────────────────────┐
│      SabPaisa PostgreSQL Database                   │
│                                                     │
│  INSERT INTO transactions_to_settle VALUES (...);   │
│                                                     │
│  PostgreSQL writes to Write-Ahead Log (WAL)         │
│  ↓                                                  │
│  WAL: {operation: INSERT, table: transactions_...} │
└─────────────────────────────────────────────────────┘
                    ↓ (Debezium reads WAL)
┌─────────────────────────────────────────────────────┐
│        Debezium PostgreSQL Connector                │
│                                                     │
│  1. Connects to PostgreSQL                          │
│  2. Creates replication slot                        │
│  3. Reads WAL in real-time                          │
│  4. Converts DB changes → Kafka events              │
└─────────────────────────────────────────────────────┘
                    ↓ (Publishes event)
┌─────────────────────────────────────────────────────┐
│              Kafka Topic                            │
│  sabpaisa.public.transactions_to_settle             │
│                                                     │
│  Event: {                                           │
│    "before": null,                                  │
│    "after": {                                       │
│      "txn_id": "TXN123",                            │
│      "merchant_code": "KAPR63",                     │
│      "amount": "5000.00",                           │
│      "txn_date": "2025-10-02",                      │
│      "status": "SUCCESS"                            │
│    },                                               │
│    "op": "c",  // create                            │
│    "ts_ms": 1727870400000                           │
│  }                                                  │
└─────────────────────────────────────────────────────┘
```

**Key Points:**
- ✅ **No Code Changes** in SabPaisa DB
- ✅ **Real-Time** (< 1 second lag)
- ✅ **Non-Intrusive** (reads WAL, doesn't query tables)
- ✅ **Guaranteed Order** (preserves transaction order)
- ✅ **At-Least-Once Delivery** (Kafka guarantees)

---

## 🔧 How Kafka Works (Your Question)

### **Kafka = Distributed Event Log**

```
┌──────────────────────────────────────────────────────┐
│                 Kafka Broker                         │
│                                                      │
│  Topic: sabpaisa.transactions                        │
│  ├─ Partition 0: [event1, event2, event3, ...]      │
│  ├─ Partition 1: [event4, event5, event6, ...]      │
│  └─ Partition 2: [event7, event8, event9, ...]      │
│                                                      │
│  Retention: 7 days (configurable)                    │
│  Replication: 3 copies (configurable)                │
└──────────────────────────────────────────────────────┘
            ↓                    ↓                  ↓
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Consumer 1     │  │  Consumer 2     │  │  Consumer 3     │
│  (Flink Job)    │  │  (Analytics)    │  │  (Alerts)       │
│                 │  │                 │  │                 │
│  Reads from     │  │  Reads from     │  │  Reads from     │
│  offset 0       │  │  offset 100     │  │  offset 50      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Features:**
- ✅ **Multiple Consumers** (same event read by many services)
- ✅ **Replay** (can go back to offset 0 and reprocess)
- ✅ **Persistence** (stores events for 7 days)
- ✅ **Scalable** (add more partitions for throughput)
- ✅ **Fault-Tolerant** (replicates across brokers)

**Already Setup:**
```yaml
# docker-compose.kafka.yml
services:
  zookeeper:  # Kafka metadata coordinator
  kafka:      # Event broker
  kafka-ui:   # Management UI (localhost:8090)
```

---

## 🔧 How Flink Works (Your Question)

### **Flink = Stream Processing Framework**

```sql
-- Example Flink SQL Job
CREATE TABLE sabpaisa_transactions (
  txn_id STRING,
  merchant_code STRING,
  amount DECIMAL(15,2),
  txn_date DATE
) WITH (
  'connector' = 'kafka',
  'topic' = 'sabpaisa.public.transactions_to_settle',
  'properties.bootstrap.servers' = 'localhost:9092',
  'format' = 'debezium-json'
);

CREATE TABLE merchant_master (
  merchant_id STRING,
  merchant_name STRING
) WITH (
  'connector' = 'jdbc',
  'url' = 'jdbc:postgresql://localhost:5433/settlepaisa_v2',
  'table-name' = 'sp_v2_merchant_master'
);

-- Real-time enrichment
INSERT INTO enriched_transactions
SELECT 
  t.txn_id,
  t.merchant_code,
  m.merchant_name,  -- Enriched!
  t.amount,
  t.txn_date
FROM sabpaisa_transactions t
LEFT JOIN merchant_master m 
  ON t.merchant_code = m.merchant_id;

-- Real-time aggregate (hourly GMV)
SELECT 
  TUMBLE_START(txn_time, INTERVAL '1' HOUR) as window_start,
  merchant_code,
  COUNT(*) as txn_count,
  SUM(amount) as gmv
FROM sabpaisa_transactions
GROUP BY 
  TUMBLE(txn_time, INTERVAL '1' HOUR),
  merchant_code;
```

**Capabilities:**
- ✅ **Stream Joins** (join Kafka streams with DB tables)
- ✅ **Windowing** (compute hourly/daily aggregates)
- ✅ **CEP** (Complex Event Processing - detect patterns)
- ✅ **State Management** (remember previous events)
- ✅ **Exactly-Once** (guarantees for critical operations)

---

## 📋 What You Need to Add

### **Step 1: Add Kafka Connect (Debezium Runtime)**

Update `docker-compose.kafka.yml`:
```yaml
  kafka-connect:
    image: debezium/connect:2.4
    hostname: kafka-connect
    container_name: settlepaisa-kafka-connect
    depends_on:
      - kafka
    ports:
      - "8083:8083"
    environment:
      BOOTSTRAP_SERVERS: kafka:29092
      GROUP_ID: 1
      CONFIG_STORAGE_TOPIC: connect_configs
      OFFSET_STORAGE_TOPIC: connect_offsets
```

### **Step 2: Configure Debezium Connector**

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sabpaisa-transactions-connector",
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "database.hostname": "3.108.237.99",
      "database.port": "5432",
      "database.user": "settlepaisainternal",
      "database.password": "sabpaisa123",
      "database.dbname": "settlepaisa",
      "database.server.name": "sabpaisa",
      "table.include.list": "public.transactions_to_settle,public.merchant_data",
      "topic.prefix": "sabpaisa",
      "plugin.name": "pgoutput"
    }
  }'
```

### **Step 3: Add Apache Flink**

```yaml
  flink-jobmanager:
    image: flink:1.17
    ports:
      - "8081:8081"
    command: jobmanager
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager

  flink-taskmanager:
    image: flink:1.17
    depends_on:
      - flink-jobmanager
    command: taskmanager
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager
```

---

## ✅ What's Already Working

| Component | Status | Port | Purpose |
|-----------|--------|------|---------|
| Kafka Broker | ✅ | 9092 | Event streaming |
| Zookeeper | ✅ | 2181 | Kafka coordination |
| Kafka UI | ✅ | 8090 | Management interface |
| SFTP Watcher | ✅ | 5106 | Bank file ingestion |
| PG Webhook Server | ✅ | 5111 | Gateway webhooks |
| SabPaisa Connector | ✅ | N/A | Direct DB queries |
| Debezium | ⏳ | 8083 | CDC (need to add) |
| Flink | ⏳ | 8081 | Stream processing (need to add) |

---

## 🎯 Recommended Next Steps

### **For Settlement Analytics (Now - 4-5 hours):**
✅ Build Analytics API querying V2 tables  
✅ Use current test/manual upload data  
✅ Power all 9 analytics tiles  
✅ Ready to demo

### **For Streaming Pipeline (Later - 1-2 weeks):**
1. Add Debezium to docker-compose
2. Configure CDC for SabPaisa tables
3. Set up Flink jobs for enrichment
4. Test end-to-end streaming
5. Cut over to production

### **Result:**
- ✅ Analytics works with test data (now)
- ✅ When streaming goes live, analytics gets real data (automatic)
- ✅ No code changes needed in analytics layer

---

**Should I proceed with building Settlement Analytics API now against the current V2 schema?**
