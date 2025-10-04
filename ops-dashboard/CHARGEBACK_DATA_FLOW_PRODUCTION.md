# Chargeback Data Flow in Production

**Date:** October 3, 2025  
**Context:** How chargebacks arrive and populate the Disputes UI

---

## Production Data Flow: Real Chargebacks

### **Question:** How do chargebacks land on the Disputes UI in production?

**Answer:** Chargebacks arrive from **4 primary sources**, get ingested, correlated, and displayed in the UI.

---

## The 4 Chargeback Data Sources

### **1. Card Network APIs (VISA/Mastercard/Rupay)**

**How it works:**
- Card networks (VISA, Mastercard, Rupay) send chargeback notifications via **webhooks** or **API polling**
- When a cardholder disputes a transaction, the network creates a case

**Example Flow:**
```
Customer → Disputes with Bank → Bank → Card Network → Webhook to SettlePaisa
```

**Data Received:**
```json
{
  "network_case_id": "CB2025001234",
  "card_network": "VISA",
  "reason_code": "10.4",
  "reason_description": "Fraudulent Transaction - Card Not Present",
  "disputed_amount": 10000,
  "currency": "INR",
  "rrn": "123456789012",
  "merchant_id": "MERCH_VISA_001",
  "transaction_date": "2025-09-15",
  "chargeback_date": "2025-10-01",
  "response_deadline": "2025-10-11"
}
```

**Integration:**
- **VISA:** VROL (Visa Resolve Online) API
- **Mastercard:** Mastercom API
- **Rupay:** Rupay Chargeback Portal API

**How we receive it:**
- **Option 1:** Webhook endpoint (real-time push)
- **Option 2:** Scheduled polling job (every 15 minutes)

---

### **2. Acquiring Bank SFTP/API (AXIS, HDFC, ICICI, BOB)**

**How it works:**
- Banks aggregate chargebacks for all merchants
- Provide daily/weekly files via **SFTP** or **REST API**

**Example: AXIS Bank SFTP**
```
Host: sftp.axisbank.com
Path: /chargebacks/settlepaisa/
File Pattern: AXIS_CHARGEBACKS_YYYYMMDD.csv

File Contents:
MERCHANT_ID,CASE_REF,TXN_DATE,CB_DATE,AMOUNT,REASON_CODE,RRN,STATUS
MERCH001,AXIS_CB_001,2025-09-15,2025-10-01,10000.00,FRAUD,123456789,OPEN
MERCH002,AXIS_CB_002,2025-09-14,2025-10-01,25000.00,NOT_RECEIVED,987654321,OPEN
```

**Example: BOB API**
```http
GET https://api.bankofbaroda.com/v1/chargebacks?date=2025-10-02
Authorization: Bearer {token}

Response:
{
  "chargebacks": [
    {
      "case_id": "BOB2025001",
      "merchant_code": "MERCH123",
      "transaction_ref": "TXN987654",
      "amount": 15000,
      "reason": "Duplicate Processing",
      "status": "PENDING_RESPONSE"
    }
  ]
}
```

**How we receive it:**
- **SFTP:** Connector runs daily at 7 PM (already built!)
- **API:** Connector polls daily at 7 PM (already built!)

---

### **3. Payment Gateway Portals (Paytm, PhonePe, Razorpay, Cashfree)**

**How it works:**
- Payment gateways receive chargebacks from their acquiring banks
- Forward to merchants via portal downloads or APIs

**Example: Razorpay Disputes API**
```http
GET https://api.razorpay.com/v1/disputes
Authorization: Basic {base64(key:secret)}

Response:
{
  "items": [
    {
      "id": "disp_MjkxOTk2OTA2OTk2",
      "payment_id": "pay_123456789",
      "amount": 50000,
      "currency": "INR",
      "status": "open",
      "reason_code": "chargeback",
      "respond_by": 1696118399,
      "created_at": 1695513599
    }
  ]
}
```

**Example: Paytm Chargeback Portal**
```
Manual Download:
1. Login to Paytm Dashboard
2. Go to Disputes > Chargebacks
3. Export CSV for date range
4. Upload to SettlePaisa
```

**How we receive it:**
- **API Connector:** Poll daily for each gateway
- **Manual Upload:** Ops team downloads CSV and uploads via UI

---

### **4. Manual Entry by Ops Team**

**How it works:**
- Merchant forwards email notification
- Ops team manually creates case in UI

**Example Email:**
```
From: disputes@axisbank.com
Subject: Chargeback Alert - Case #AXIS_CB_123

Dear Merchant,

A chargeback has been filed for the following transaction:
- Transaction ID: TXN987654
- Amount: ₹10,000
- Reason: Customer claims transaction was fraudulent
- Deadline to respond: October 11, 2025

Please submit evidence by the deadline.
```

**Ops creates case via UI:**
- Click "Add Dispute" button
- Fill form with case details
- System creates chargeback record

---

## Complete Data Ingestion Architecture

### **System Components**

```
┌─────────────────────────────────────────────────────────────┐
│                    CHARGEBACK DATA SOURCES                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Card Networks│  │  Bank SFTP   │  │  Gateway APIs│      │
│  │ (Webhooks)   │  │  (Daily CSV) │  │ (Razorpay/PP)│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│               CHARGEBACK INGESTION SERVICE                   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. RECEIVE CHARGEBACK DATA                          │   │
│  │     - Webhook endpoint: POST /ingest/webhook         │   │
│  │     - SFTP poll job: Daily at 7 PM                   │   │
│  │     - API poll job: Every 15 min                     │   │
│  │     - Manual upload: POST /ingest/csv                │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  2. NORMALIZE & VALIDATE                             │   │
│  │     - Parse different formats (JSON/CSV/XML)         │   │
│  │     - Map to standard schema                         │   │
│  │     - Validate required fields                       │   │
│  │     - Deduplicate (network_case_id + acquirer)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  3. AUTO-CORRELATION                                 │   │
│  │     - Search PG transactions by:                     │   │
│  │       • UTR (UPI)                                    │   │
│  │       • RRN (Card)                                   │   │
│  │       • Gateway Transaction ID                       │   │
│  │       • Fuzzy match (amount + date)                  │   │
│  │     - Calculate confidence score                     │   │
│  │     - Link to original transaction                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  4. SAVE TO DATABASE                                 │   │
│  │     INSERT INTO sp_v2_chargebacks (...)              │   │
│  │     INSERT INTO sp_v2_chargeback_correlations (...)  │   │
│  │     INSERT INTO sp_v2_chargeback_audit (...)         │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  5. NOTIFICATIONS                                    │   │
│  │     - Email to assigned team                         │   │
│  │     - Slack alert for high-value disputes            │   │
│  │     - Update merchant dashboard                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   DISPUTES UI (Already Built!)               │
│                                                               │
│  - Active Cases: Shows all OPEN chargebacks                 │
│  - Evidence Required: Needs document upload                 │
│  - SLA Tracking: Deadline countdown                         │
│  - Case Detail: View transaction, upload evidence           │
│  - Status Management: Update outcomes (WON/LOST)            │
└─────────────────────────────────────────────────────────────┘
```

---

## Example: Complete Flow for a Real Chargeback

### **Day 1: Chargeback Arrives**

**11:30 AM - VISA Network Webhook**
```http
POST https://ops.settlepaisa.com/api/chargebacks/ingest/webhook
Content-Type: application/json
X-VISA-Signature: abc123...

{
  "event_type": "chargeback.created",
  "case_id": "CB2025001234",
  "merchant_acquirer_id": "AXIS_MERCH_001",
  "transaction": {
    "rrn": "123456789012",
    "amount": 1000000,
    "currency": "INR",
    "date": "2025-09-15T10:30:00Z"
  },
  "dispute": {
    "reason_code": "10.4",
    "reason_text": "Fraudulent Transaction - Card Not Present",
    "response_due_date": "2025-10-11T23:59:59Z"
  }
}
```

**11:30:01 AM - Ingestion Service Processing**
```
[INGESTION] Received webhook from VISA
[VALIDATE] ✓ Signature verified
[PARSE] ✓ Data extracted
[DEDUPE] ✓ No duplicate found
[CORRELATE] Searching for RRN: 123456789012
[CORRELATE] ✓ Found transaction: TXN_20250915_001 (confidence: 0.95)
[DATABASE] ✓ Inserted chargeback: cb_000001
[DATABASE] ✓ Linked correlation: corr_000001
[NOTIFY] ✓ Email sent to ops@settlepaisa.com
```

**Database State:**
```sql
-- sp_v2_chargebacks
INSERT INTO sp_v2_chargebacks (
    id, merchant_id, acquirer, network_case_id, txn_ref,
    original_gross_paise, chargeback_paise, fees_paise,
    reason_code, stage, status, received_at, deadline_at
) VALUES (
    'cb_000001', 'MERCH_001', 'VISA', 'CB2025001234', '123456789012',
    1000000, 1000000, 50000,
    '10.4', 'NEW', 'OPEN', '2025-10-03 11:30:00', '2025-10-11 23:59:59'
);

-- sp_v2_chargeback_correlations
INSERT INTO sp_v2_chargeback_correlations (
    chargeback_id, pg_transaction_id, correlation_method, confidence_score
) VALUES (
    'cb_000001', 'TXN_20250915_001', 'RRN_MATCH', 0.95
);

-- sp_v2_chargeback_audit
INSERT INTO sp_v2_chargeback_audit (
    chargeback_id, action, after_value, performed_by
) VALUES (
    'cb_000001', 'CREATE', 
    '{"source": "VISA_WEBHOOK", "case_id": "CB2025001234"}',
    'SYSTEM'
);
```

**11:30:02 AM - Ops Team Gets Email**
```
Subject: 🚨 New Chargeback Alert - ₹10,000

Case Ref: VISA-2025-276-cb000001
Merchant: Flipkart
Amount: ₹10,000
Reason: Fraudulent Transaction
Deadline: Oct 11, 2025 (8 days)

Action Required: Upload evidence

View Case: https://ops.settlepaisa.com/disputes?case=cb_000001
```

---

### **Day 2: Ops Team Uploads Evidence**

**2:00 PM - Ops user clicks case in UI**
- UI calls: `GET /v1/chargebacks/cb_000001`
- Shows case details, transaction info, timeline

**2:05 PM - Uploads 3 PDFs**
- UI calls: `POST /v1/chargebacks/cb_000001/evidence`
- Files uploaded to S3
- Records saved to `sp_v2_chargeback_documents`

**2:10 PM - Submits Representment**
- UI calls: `POST /v1/chargebacks/cb_000001/representment`
- Status changes: NEW → REPRESENTMENT
- Evidence submitted to VISA portal
- Record saved to `sp_v2_chargeback_representments`

---

### **Day 10: VISA Decision Arrives**

**4:00 PM - VISA Webhook (Decision)**
```http
POST https://ops.settlepaisa.com/api/chargebacks/ingest/webhook
{
  "event_type": "chargeback.resolved",
  "case_id": "CB2025001234",
  "outcome": "merchant_won",
  "resolution_amount": 0,
  "decision_date": "2025-10-13T16:00:00Z"
}
```

**Ingestion Service:**
```
[WEBHOOK] Received decision from VISA
[UPDATE] Case cb_000001: outcome = WON
[UPDATE] Status: OPEN → RECOVERED
[DATABASE] ✓ Updated chargeback
[NOTIFY] ✓ Email sent to ops@settlepaisa.com
```

**Database Update:**
```sql
UPDATE sp_v2_chargebacks
SET stage = 'CLOSED',
    outcome = 'WON',
    status = 'RECOVERED',
    closed_at = NOW()
WHERE id = 'cb_000001';

UPDATE sp_v2_chargeback_representments
SET outcome = 'ACCEPTED',
    network_response = 'Evidence accepted. Funds retained by merchant.',
    response_received_at = NOW()
WHERE chargeback_id = 'cb_000001';
```

**UI Updates Automatically:**
- Case moves from "Open" tab to "Won" tab
- Financial Impact tile: Recovered +₹10,000
- Win Rate: Updates to 73.1%

---

## Implementation: Ingestion Endpoints We Need to Build

### **1. Webhook Ingestion Endpoint**
```
POST /api/chargebacks/ingest/webhook
- Accepts JSON from card networks
- Validates signature
- Parses and saves
```

### **2. CSV Bulk Upload Endpoint**
```
POST /api/chargebacks/ingest/csv
- Accepts CSV file from bank SFTP
- Parses rows
- Batch inserts
```

### **3. Gateway API Polling Job**
```
Scheduled Job: Every 15 minutes
- Calls Razorpay/Paytm/PhonePe APIs
- Fetches new disputes
- Saves to database
```

### **4. Auto-Correlation Engine**
```
Function: correlateChargeback(chargeback)
- Search PG transactions by UTR/RRN
- Calculate confidence scores
- Link transactions
```

---

## Summary: Production Data Flow

| Step | What Happens | Where |
|------|--------------|-------|
| **1. Chargeback Occurs** | Customer disputes transaction with bank | Customer's Bank |
| **2. Network Notification** | VISA/MC/Rupay sends chargeback notice | Card Network |
| **3. SettlePaisa Receives** | Webhook/SFTP/API delivers data | Ingestion Service |
| **4. Data Normalized** | Parse different formats to standard schema | Ingestion Service |
| **5. Auto-Correlation** | Link to original PG transaction | Correlation Engine |
| **6. Save to Database** | Insert into `sp_v2_chargebacks` | PostgreSQL |
| **7. Notify Ops Team** | Email/Slack alert sent | Notification Service |
| **8. UI Updates** | Case appears in Disputes dashboard | React UI |
| **9. Ops Reviews** | Upload evidence, submit representment | Disputes UI |
| **10. Decision Arrives** | Webhook updates outcome (WON/LOST) | Ingestion Service |
| **11. Financial Recovery** | If lost, deduct from settlement/reserve | Recovery Service |

---

## Next: What We're Building Now

1. ✅ **Database Schema** - DONE (7 tables created)
2. 🔄 **Disputes Backend API** - IN PROGRESS
   - GET /v1/chargebacks (list)
   - GET /v1/chargebacks/:id (detail)
   - POST /v1/chargebacks/:id/status
   - POST /v1/chargebacks/:id/evidence
   - POST /v1/chargebacks/:id/representment
3. ⏳ **Ingestion Service** - NEXT
   - POST /api/chargebacks/ingest/webhook
   - POST /api/chargebacks/ingest/csv
   - Auto-correlation engine
   - Notification service

Once built, your Disputes UI will display **real chargebacks** from production systems! 🚀
