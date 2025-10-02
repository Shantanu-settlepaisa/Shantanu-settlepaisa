# Settlement Analytics - Streaming Architecture Plan

**Date:** October 2, 2025  
**User's Vision:** Power data transfer through **Debezium + Kafka + Apache Flink**

---

## 🎯 Why Option B Makes Perfect Sense Now

### Your Architecture Plan:
```
SabPaisa Core DB (PostgreSQL)
    ↓ (CDC via Debezium)
Apache Kafka (Event Stream)
    ↓ (Stream Processing)
Apache Flink (Transformations)
    ↓ (Sink)
V2 Database (sp_v2_transactions)
    ↓ (Query)
Settlement Analytics API
```

### **This Changes Everything!**

With **Debezium + Kafka + Flink**, Option B becomes the **superior choice** because:

---

## ✅ Option B Advantages with Streaming

### 1. **Real-Time Data (Not Batch Sync)**
```
Traditional Option B: Daily batch sync at 2 AM
Your Option B: Real-time CDC streaming (< 1 second lag)

❌ Batch: 24-hour data lag
✅ Streaming: Near real-time analytics
```

### 2. **Event-Driven Architecture**
```
SabPaisa transaction created
    ↓ (Debezium captures INSERT)
Kafka topic: sabpaisa.transactions
    ↓ (Flink processes)
V2 enriched with settlement metadata
    ↓ (Materialized view)
Analytics dashboard updates instantly
```

### 3. **Transformation Layer (Flink)**
```sql
-- Flink SQL can do real-time transformations
CREATE TABLE enriched_transactions AS
SELECT 
  t.txn_id,
  t.merchant_code,
  t.amount,
  t.payment_mode,
  t.txn_date,
  m.merchant_name,
  m.settlement_cycle,
  CASE 
    WHEN sb.batch_id IS NOT NULL THEN 'SETTLED'
    ELSE 'UNSETTLED'
  END as settlement_status
FROM sabpaisa_transactions t
LEFT JOIN merchant_master m ON t.merchant_code = m.merchant_id
LEFT JOIN settlement_batches sb ON t.txn_id = sb.transaction_id
```

### 4. **Decoupled Services**
```
✅ Analytics API doesn't depend on SabPaisa DB uptime
✅ V2 database becomes source of truth for analytics
✅ Can add caching, indexing, materialized views
✅ Can handle high query load independently
```

### 5. **Stream Processing Capabilities**
```javascript
// Flink can compute real-time aggregates
- Rolling settlement rates (last 1 hour, 24 hours)
- Real-time GMV trends
- Live funnel metrics
- Immediate anomaly detection
```

---

## 🏗️ Complete Streaming Architecture

### **Phase 1: CDC Setup (Debezium)**

#### **Debezium Connectors:**
```yaml
# debezium-sabpaisa-connector.yaml
name: sabpaisa-transactions-connector
connector.class: io.debezium.connector.postgresql.PostgresConnector
database.hostname: 3.108.237.99
database.port: 5432
database.user: settlepaisainternal
database.password: sabpaisa123
database.dbname: settlepaisa

# Capture specific tables
table.include.list: public.transactions_to_settle,public.merchant_data

# Kafka topics
topic.prefix: sabpaisa
```

#### **Captured Events:**
```json
// Kafka topic: sabpaisa.public.transactions_to_settle
{
  "before": null,
  "after": {
    "txn_id": "TXN123456",
    "merchant_code": "KAPR63",
    "amount": "5000.00",
    "payment_mode": "UPI",
    "txn_date": "2025-10-02",
    "is_settled": "0",
    "status": "SUCCESS"
  },
  "op": "c",  // create
  "ts_ms": 1727870400000
}
```

---

### **Phase 2: Stream Processing (Flink)**

#### **Flink Job: Transaction Enrichment**
```sql
-- Flink SQL
CREATE TABLE sabpaisa_transactions (
  txn_id STRING,
  merchant_code STRING,
  amount DECIMAL(15,2),
  payment_mode STRING,
  txn_date DATE,
  is_settled STRING,
  status STRING,
  event_time TIMESTAMP(3) METADATA FROM 'timestamp'
) WITH (
  'connector' = 'kafka',
  'topic' = 'sabpaisa.public.transactions_to_settle',
  'properties.bootstrap.servers' = 'localhost:9092',
  'format' = 'debezium-json'
);

CREATE TABLE merchant_master (
  merchant_id STRING,
  merchant_name STRING,
  settlement_cycle INT,
  rolling_reserve_percentage DECIMAL(5,2)
) WITH (
  'connector' = 'jdbc',
  'url' = 'jdbc:postgresql://localhost:5433/settlepaisa_v2',
  'table-name' = 'sp_v2_merchant_master'
);

-- Enriched stream
CREATE TABLE enriched_transactions AS
SELECT 
  t.txn_id as transaction_id,
  t.merchant_code as merchant_id,
  t.amount * 100 as amount_paise,  -- Convert to paise
  t.payment_mode as payment_method,
  t.txn_date as transaction_date,
  m.merchant_name,
  m.settlement_cycle,
  'SABPAISA_STREAM' as source_type,
  CASE 
    WHEN t.is_settled = '1' THEN 'SETTLED'
    WHEN t.status = 'SUCCESS' THEN 'RECONCILED'
    ELSE 'PENDING'
  END as status,
  t.event_time as created_at
FROM sabpaisa_transactions t
LEFT JOIN merchant_master m
  ON t.merchant_code = m.merchant_id;
```

#### **Flink Job: Real-Time Aggregates**
```sql
-- Real-time settlement rate (tumbling window)
CREATE TABLE settlement_rate_hourly AS
SELECT 
  TUMBLE_START(event_time, INTERVAL '1' HOUR) as window_start,
  COUNT(*) as total_txns,
  COUNT(*) FILTER (WHERE status = 'SETTLED') as settled_txns,
  COUNT(*) FILTER (WHERE status = 'SETTLED') * 100.0 / COUNT(*) as settlement_rate
FROM enriched_transactions
GROUP BY TUMBLE(event_time, INTERVAL '1' HOUR);

-- Real-time GMV by payment mode
CREATE TABLE gmv_by_mode_realtime AS
SELECT 
  payment_method,
  SUM(amount_paise) as total_amount_paise,
  COUNT(*) as txn_count
FROM enriched_transactions
WHERE event_time > CURRENT_TIMESTAMP - INTERVAL '1' HOUR
GROUP BY payment_method;
```

---

### **Phase 3: Sink to V2 Database**

#### **Flink Sink Connector:**
```sql
-- Write enriched data to V2
CREATE TABLE v2_transactions_sink (
  transaction_id STRING,
  merchant_id STRING,
  amount_paise BIGINT,
  payment_method STRING,
  transaction_date DATE,
  source_type STRING,
  status STRING,
  created_at TIMESTAMP,
  PRIMARY KEY (transaction_id) NOT ENFORCED
) WITH (
  'connector' = 'jdbc',
  'url' = 'jdbc:postgresql://localhost:5433/settlepaisa_v2',
  'table-name' = 'sp_v2_transactions',
  'username' = 'postgres',
  'password' = 'settlepaisa123',
  'sink.buffer-flush.max-rows' = '100',
  'sink.buffer-flush.interval' = '1s'
);

-- Insert enriched stream into V2
INSERT INTO v2_transactions_sink
SELECT * FROM enriched_transactions;
```

---

## 📊 Analytics Architecture with Streaming

### **Full Data Flow:**

```
┌──────────────────────────────────────────────────────────┐
│          SabPaisa Core DB (PostgreSQL)                   │
│  • transactions_to_settle (source of truth)              │
│  • merchant_data                                         │
│  • payment_gateway_response                              │
└──────────────────────────────────────────────────────────┘
                    ↓ (Debezium CDC)
┌──────────────────────────────────────────────────────────┐
│               Apache Kafka (Event Streaming)             │
│  Topics:                                                 │
│  • sabpaisa.public.transactions_to_settle                │
│  • sabpaisa.public.merchant_data                         │
│  • settlement.batches.created (V2 events)                │
└──────────────────────────────────────────────────────────┘
                    ↓ (Flink Processing)
┌──────────────────────────────────────────────────────────┐
│            Apache Flink (Stream Processing)              │
│  Jobs:                                                   │
│  1. Transaction Enrichment                               │
│  2. Real-Time Aggregates (hourly GMV, rates)             │
│  3. Settlement Status Updates                            │
│  4. Anomaly Detection                                    │
└──────────────────────────────────────────────────────────┘
                    ↓ (Sink)
┌──────────────────────────────────────────────────────────┐
│        V2 Database (Analytics-Ready Data)                │
│  Tables:                                                 │
│  • sp_v2_transactions (enriched, real-time)              │
│  • sp_v2_settlement_batches                              │
│  • sp_v2_realtime_aggregates (materialized)              │
└──────────────────────────────────────────────────────────┘
                    ↓ (Query)
┌──────────────────────────────────────────────────────────┐
│        Settlement Analytics API (Port 5107)              │
│  • Fast queries (V2 only, no cross-DB)                   │
│  • Materialized views for performance                    │
│  • Real-time KPIs                                        │
└──────────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────────┐
│         Settlement Analytics UI (React)                  │
│  • Real-time dashboard updates                           │
│  • Live GMV trends                                       │
│  • Instant settlement rates                              │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 Why This is Superior to Option A

| Feature | Option A (Direct Query) | Option B (Streaming) |
|---------|-------------------------|----------------------|
| **Data Freshness** | Real-time | Real-time (< 1s lag) |
| **Query Performance** | Cross-DB joins (slow) | Single DB (fast) |
| **SabPaisa Dependency** | Yes (runtime) | No (decoupled) |
| **Analytics Load** | Impacts SabPaisa DB | Isolated to V2 |
| **Scalability** | Limited by SabPaisa | Horizontally scalable |
| **Transformations** | Application layer | Flink SQL (native) |
| **Real-Time Aggregates** | Computed on query | Pre-computed (Flink) |
| **Failure Recovery** | No buffering | Kafka replay |
| **Multi-Consumer** | Not possible | Multiple consumers |
| **Audit Trail** | Complex | Event log (Kafka) |

---

## 🚀 Implementation Phases

### **Phase 0: Infrastructure Setup (Not in Scope Now)**
```bash
# Install Kafka
brew install kafka

# Install Flink
brew install apache-flink

# Install Debezium
# Docker compose with Debezium connector
```

### **Phase 1: Settlement Analytics API (Our Current Focus)**
```
Build Analytics API assuming V2 has data
├─ Design endpoints for 9 tiles
├─ Query V2 tables (sp_v2_transactions, sp_v2_settlement_batches)
├─ Return analytics payloads
└─ Wire up to frontend

Timeline: 4-5 hours
```

### **Phase 2: Streaming Pipeline (Future/Parallel)**
```
Set up CDC → Kafka → Flink → V2
├─ Debezium connector for SabPaisa
├─ Kafka topics for transaction events
├─ Flink jobs for enrichment
└─ Sink to V2 database

Timeline: 1-2 weeks (separate workstream)
```

### **Phase 3: Integration**
```
Once streaming is live:
├─ sp_v2_transactions gets real-time data
├─ Analytics API queries start showing real data
└─ No code changes needed in Analytics API!
```

---

## 💡 Key Insight: Decoupled Development

### **Beautiful Part:**
You can build Settlement Analytics API **right now** against current V2 schema, and when streaming infrastructure comes online later, **analytics just works** with real data!

```javascript
// Analytics API code (stays the same!)
app.get('/analytics/kpis', async (req, res) => {
  const settled = await v2Pool.query(`
    SELECT COUNT(*), SUM(amount_paise)
    FROM sp_v2_transactions
    WHERE status = 'SETTLED'
  `);
  
  // This query works whether data came from:
  // - Manual upload (current)
  // - Streaming pipeline (future)
  // - Batch sync (alternative)
});
```

---

## 📋 V2 Schema Alignment

### **Current Schema:**
```sql
sp_v2_transactions (
  transaction_id VARCHAR,
  merchant_id VARCHAR,
  amount_paise BIGINT,
  payment_method VARCHAR,
  transaction_date DATE,
  source_type VARCHAR,  -- 'MANUAL_UPLOAD' or 'SABPAISA_STREAM'
  status VARCHAR,       -- 'PENDING', 'RECONCILED', 'SETTLED'
  settlement_batch_id UUID
)
```

### **This schema is PERFECT for streaming!**
- ✅ `source_type` distinguishes manual vs streaming
- ✅ `status` tracks lifecycle
- ✅ `settlement_batch_id` links to settlements
- ✅ No schema changes needed!

---

## 🎯 Recommendation

### **Proceed with Both in Parallel:**

#### **Workstream 1: Settlement Analytics (Now)**
- Build Analytics API querying V2 tables
- Uses current test data for development
- 4-5 hours effort
- **I can do this now**

#### **Workstream 2: Streaming Pipeline (Later/Parallel)**
- Set up Debezium + Kafka + Flink
- Production infrastructure
- 1-2 weeks effort
- **You/DevOps team handles this**

### **Result:**
- ✅ Analytics dashboard ready to demo (test data)
- ✅ When streaming goes live, analytics shows real data
- ✅ No code changes needed in analytics layer
- ✅ Clean separation of concerns

---

## 🔥 Additional Benefits of Streaming

### **1. Bi-Directional Events**
```
V2 can also publish events back to Kafka:
- Settlement batch created → Kafka
- Settlement approved → Kafka
- Bank transfer completed → Kafka

SabPaisa can consume these events!
```

### **2. Multi-Consumer Pattern**
```
Same Kafka topic can feed:
├─ V2 Analytics (Flink → PostgreSQL)
├─ Data Warehouse (Flink → Snowflake)
├─ ML Models (Flink → Feature Store)
└─ Real-Time Alerts (Flink → Notification Service)
```

### **3. Time-Travel Analytics**
```
Kafka retention allows:
- Replay events for backfill
- Historical analysis
- Debugging production issues
```

---

## ✅ Conclusion

**Your Vision (Debezium + Kafka + Flink) makes Option B the CLEAR winner!**

### **Why Option B Now:**
1. ✅ Real-time data (not batch)
2. ✅ Decoupled architecture (independent services)
3. ✅ Scalable (Flink horizontal scaling)
4. ✅ Fast analytics (V2 only, no cross-DB)
5. ✅ Future-proof (event-driven)
6. ✅ Multi-consumer ready

### **Next Steps:**
1. **I build Analytics API now** (using current V2 schema)
2. **You set up streaming later** (Debezium + Kafka + Flink)
3. **Analytics automatically gets real data** (no code changes)

**Should I proceed with building the Settlement Analytics API against V2 tables?**
