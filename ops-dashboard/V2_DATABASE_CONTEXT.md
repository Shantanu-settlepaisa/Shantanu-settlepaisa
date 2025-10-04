# SettlePaisa V2 Database - Context Document

**Database:** `settlepaisa_v2`  
**Version:** 2.16.0  
**Generated:** October 3, 2025  
**Total Tables:** 49

---

## Table of Contents

1. [Overview](#overview)
2. [Core Transaction Tables](#core-transaction-tables)
3. [Settlement & Payout Tables](#settlement--payout-tables)
4. [Reconciliation Tables](#reconciliation-tables)
5. [Exception Management Tables](#exception-management-tables)
6. [Merchant Configuration Tables](#merchant-configuration-tables)
7. [Chargeback & Disputes Tables](#chargeback--disputes-tables)
8. [Connector & Integration Tables](#connector--integration-tables)
9. [Metrics & Reporting Tables](#metrics--reporting-tables)
10. [Data Relationships](#data-relationships)
11. [Key Design Patterns](#key-design-patterns)

---

## Overview

The SettlePaisa V2 database is a **production-grade payment operations platform** managing:
- **Transaction Reconciliation** (PG ↔ Bank)
- **Settlement Calculation** (MDR, GST, Rolling Reserve)
- **Exception Workflow** (11 exception types with SLA tracking)
- **Chargeback Management** (Dispute lifecycle & recovery)
- **Bank Transfers** (NEFT/RTGS/IMPS queue management)
- **Connector System** (SFTP/API auto-sync)

### Key Characteristics
✅ **All amounts in PAISE** (multiply by 100 from rupees)  
✅ **UUID primary keys** for distributed systems  
✅ **JSONB for flexible metadata** (external system integration)  
✅ **Audit trails** (created_at, updated_at, created_by, updated_by)  
✅ **Foreign key constraints** for referential integrity  
✅ **Comprehensive indexes** for query performance

---

## Core Transaction Tables

### 1. **sp_v2_transactions** (Main Transaction Log)

**Purpose:** Central transaction registry for all payment gateway transactions

**Key Columns:**
```
id                    : bigint (SERIAL PK)
transaction_id        : VARCHAR(100) UNIQUE (business identifier)
merchant_id           : VARCHAR(50) (merchant identifier)
amount_paise          : bigint (transaction amount in paise)
transaction_date      : date (transaction date)
transaction_timestamp : timestamptz (exact transaction time)
source_type           : VARCHAR(20) (MANUAL_UPLOAD | API_SYNC | CONNECTOR)
payment_method        : VARCHAR(50) (UPI | CARD | NETBANKING | WALLET)
utr                   : VARCHAR(50) (bank UTR for matching)
status                : VARCHAR(20) (PENDING | RECONCILED | UNMATCHED | EXCEPTION)
exception_reason      : VARCHAR(50) (reason code if status=EXCEPTION)
settlement_batch_id   : UUID FK → sp_v2_settlement_batches
acquirer_code         : VARCHAR(50) (HDFC | ICICI | AXIS)
merchant_name         : VARCHAR(255) (denormalized from settlement batch)
```

**Indexes:**
- `transaction_id` (UNIQUE)
- `merchant_id, transaction_date`
- `status, exception_reason`

**Data Flow:**
```
Ingestion → Normalization → Reconciliation → Settlement → Bank Transfer
```

**Relationships:**
- → `sp_v2_settlement_batches` (many transactions → one batch)
- → `sp_v2_exception_workflow` (one transaction → one exception record)
- → `sp_v2_bank_statements` (many-to-many via reconciliation)

---

### 2. **sp_v2_bank_statements** (Bank Transaction Log)

**Purpose:** Bank statement records for reconciliation matching

**Key Columns:**
```
id               : bigint (SERIAL PK)
bank_ref         : VARCHAR(100) UNIQUE (bank reference number)
bank_name        : VARCHAR(100) (acquirer bank name)
amount_paise     : bigint (credited amount in paise)
transaction_date : date (bank transaction date)
utr              : VARCHAR(50) (UTR for matching)
remarks          : text (bank remarks/narration)
debit_credit     : VARCHAR(10) (CREDIT | DEBIT)
source_type      : VARCHAR(20) (MANUAL_UPLOAD | SFTP_CONNECTOR | API)
processed        : boolean (matched or not)
```

**Indexes:**
- `bank_ref` (UNIQUE)
- `utr, transaction_date`

---

## Settlement & Payout Tables

### 3. **sp_v2_settlement_batches** (Settlement Batch Header)

**Purpose:** Batch-level settlement aggregates per merchant per cycle

**Key Columns:**
```
id                      : UUID PK
merchant_id             : VARCHAR(50)
merchant_name           : VARCHAR(200)
cycle_date              : date (settlement cycle date)
total_transactions      : integer
gross_amount_paise      : bigint (total transaction amount)
total_commission_paise  : bigint (MDR + endpoint charges)
total_gst_paise         : bigint (GST on commissions)
total_reserve_paise     : bigint (rolling reserve held)
net_amount_paise        : bigint (final payout = gross - commission - gst - reserve)
status                  : VARCHAR(30) (PENDING_APPROVAL | APPROVED | PROCESSING | SETTLED | PAID)
acquirer_code           : VARCHAR(50) (HDFC | ICICI | AXIS)
bank_reference_number   : VARCHAR(100) (UTR of payout)
approved_at             : timestamp
approved_by             : VARCHAR(100)
settlement_completed_at : timestamp
```

**Calculation:**
```
net_amount_paise = gross_amount_paise 
                   - total_commission_paise 
                   - total_gst_paise 
                   - total_reserve_paise
```

**Indexes:**
- `merchant_id, cycle_date`
- `status`
- `cycle_date`

**Relationships:**
- ← `sp_v2_settlement_items` (one batch → many items)
- ← `sp_v2_transactions` (one batch → many transactions)
- ← `sp_v2_bank_transfer_queue` (one batch → one transfer)

---

### 4. **sp_v2_settlement_items** (Transaction-level Settlement Breakdown)

**Purpose:** Itemized settlement calculation for each transaction

**Key Columns:**
```
id                  : UUID PK
settlement_batch_id : UUID FK → sp_v2_settlement_batches
transaction_id      : VARCHAR(100) (PG transaction ID)
amount_paise        : bigint (gross transaction amount)
commission_paise    : bigint (MDR fees)
gst_paise           : bigint (GST on MDR @ 18%)
reserve_paise       : bigint (rolling reserve amount)
net_paise           : bigint (final merchant payout for this txn)
payment_mode        : VARCHAR(50) (UPI | CARD | NETBANKING)
fee_bearer          : VARCHAR(20) (merchant | customer | platform)
fee_bearer_code     : VARCHAR(10) (1=customer, 2=merchant, 3=custom, 4=platform)
commission_type     : VARCHAR(20) (percentage | flat)
commission_rate     : numeric (e.g., 2.0 for 2%)
```

**Calculation Logic:**
```javascript
// Per-transaction settlement
commission_paise = (amount_paise × commission_rate / 100)  // if percentage
gst_paise = commission_paise × 0.18  // 18% GST
reserve_paise = (amount_paise - commission_paise - gst_paise) × rolling_reserve_percentage / 100
net_paise = amount_paise - commission_paise - gst_paise - reserve_paise
```

**Indexes:**
- `settlement_batch_id`
- `transaction_id`

---

### 5. **sp_v2_bank_transfer_queue** (Payout Queue)

**Purpose:** Queue for NEFT/RTGS/IMPS bank transfers

**Key Columns:**
```
id                     : UUID PK
batch_id               : UUID FK → sp_v2_settlement_batches
transfer_mode          : VARCHAR(20) (NEFT | RTGS | IMPS)
amount_paise           : bigint
beneficiary_name       : VARCHAR(200)
account_number         : VARCHAR(30)
ifsc_code              : VARCHAR(11)
status                 : VARCHAR(30) (queued | processing | sent | completed | failed)
utr_number             : VARCHAR(50) (bank UTR after transfer)
bank_reference_number  : VARCHAR(100)
queued_at              : timestamp
sent_at                : timestamp
completed_at           : timestamp
retry_count            : integer
last_error             : text
api_request            : jsonb (bank API payload)
api_response           : jsonb (bank API response)
```

**Status Flow:**
```
queued → processing → sent → completed
                    ↓
                  failed (retry_count++ → queued again)
```

**Indexes:**
- `batch_id`
- `status`
- `utr_number`

---

### 6. **sp_v2_rolling_reserve_ledger** (Reserve Tracking)

**Purpose:** Track rolling reserve held and releases

**Key Columns:**
```
id                     : UUID PK
settlement_batch_id    : UUID FK → sp_v2_settlement_batches
merchant_id            : VARCHAR(50)
reserve_amount_paise   : bigint (amount held)
released_amount_paise  : bigint (amount released)
balance_paise          : bigint (current reserve balance)
hold_date              : date (date reserve was held)
release_date           : date (date reserve will be released)
status                 : VARCHAR(20) (HELD | RELEASED | PARTIALLY_RELEASED)
reserve_percentage     : numeric (e.g., 10.0 for 10%)
hold_days              : integer (e.g., 7 for T+7)
```

**Business Logic:**
```
hold_date = settlement_batch.cycle_date
release_date = hold_date + hold_days
balance_paise = reserve_amount_paise - released_amount_paise
```

**Indexes:**
- `merchant_id`
- `release_date, status`
- `settlement_batch_id`

---

## Reconciliation Tables

### 7. **sp_v2_recon_matches** (Reconciliation Match Log)

**Purpose:** Record PG ↔ Bank matches

**Key Columns:**
```
id                     : UUID PK
utr_id                 : UUID FK → sp_v2_utr_credits
item_id                : UUID FK → (transaction reference)
match_type             : VARCHAR(10) (EXACT | UTR_ONLY | AMOUNT_ONLY | FUZZY)
match_score            : smallint (0-100 confidence score)
amount_difference_paise: bigint (variance between PG and Bank)
matched_by             : VARCHAR(50) (SYSTEM | MANUAL)
notes                  : text
```

**Match Types:**
- **EXACT:** UTR + Amount + Date match
- **UTR_ONLY:** UTR matches but amount differs
- **FUZZY:** Probabilistic match based on multiple factors

---

### 8. **sp_v2_reconciliation_jobs** (Recon Job Tracking)

**Purpose:** Track reconciliation batch runs

**Key Columns:**
```
job_id                   : VARCHAR(100) UNIQUE
job_name                 : VARCHAR(255)
date_from                : date
date_to                  : date
total_pg_records         : integer
total_bank_records       : integer
matched_records          : integer
unmatched_pg             : integer
unmatched_bank           : integer
exception_records        : integer
total_amount_paise       : bigint
reconciled_amount_paise  : bigint
variance_amount_paise    : bigint
status                   : VARCHAR(20) (RUNNING | COMPLETED | FAILED)
processing_start         : timestamptz
processing_end           : timestamptz
```

**Metrics:**
```
match_rate = (matched_records / total_pg_records) × 100
variance_rate = (variance_amount_paise / total_amount_paise) × 100
```

---

### 9. **sp_v2_reconciliation_results** (Per-transaction Recon Results)

**Purpose:** Store reconciliation outcome for each transaction

**Key Columns:**
```
job_id                : VARCHAR(100) FK → sp_v2_reconciliation_jobs
pg_transaction_id     : VARCHAR(100)
bank_statement_id     : bigint FK → sp_v2_bank_statements
match_status          : VARCHAR(20) (MATCHED | UNMATCHED | EXCEPTION)
match_score           : numeric (0-100)
exception_reason_code : VARCHAR(50) (if match_status=EXCEPTION)
exception_severity    : VARCHAR(20) (CRITICAL | HIGH | MEDIUM | LOW)
pg_amount_paise       : bigint
bank_amount_paise     : bigint
variance_paise        : bigint
```

---

## Exception Management Tables

### 10. **sp_v2_exception_workflow** (Exception Tracking)

**Purpose:** Workflow management for reconciliation exceptions

**Key Columns:**
```
exception_id         : VARCHAR(50) UNIQUE (business ID)
transaction_id       : bigint FK → sp_v2_transactions
bank_statement_id    : bigint FK → sp_v2_bank_statements
reason               : VARCHAR(50) (exception type code)
severity             : VARCHAR(20) (CRITICAL | HIGH | MEDIUM | LOW)
status               : VARCHAR(20) (open | in_progress | resolved | snoozed | escalated)
assigned_to          : VARCHAR(100) (user ID)
assigned_to_name     : VARCHAR(255)
tags                 : text[] (for categorization)
sla_due_at           : timestamptz (deadline for resolution)
sla_breached         : boolean
resolved_at          : timestamptz
resolved_by          : VARCHAR(100)
resolution           : VARCHAR(50) (manual_match | auto_corrected | written_off)
pg_amount_paise      : bigint
bank_amount_paise    : bigint
amount_delta_paise   : bigint (difference)
merchant_id          : VARCHAR(50)
acquirer_code        : VARCHAR(50)
cycle_date           : date
utr                  : VARCHAR(100)
```

**Exception Types (11 total):**
1. `UTR_MISSING_OR_INVALID` - PG transaction has no UTR
2. `DUPLICATE_PG_ENTRY` - Same UTR appears multiple times in PG
3. `DUPLICATE_BANK_ENTRY` - Same UTR appears multiple times in Bank
4. `AMOUNT_MISMATCH` - UTR matches but amount differs (beyond tolerance)
5. `DATE_OUT_OF_WINDOW` - Date difference exceeds T+2 window
6. `FEE_MISMATCH` - MDR fee calculation variance
7. `FEES_VARIANCE` - Bank fee vs recorded fee mismatch
8. `ROUNDING_ERROR` - ₹0.01 paisa difference
9. `UTR_MISMATCH` - RRN vs UTR format mismatch
10. `UNMATCHED_IN_BANK` - PG transaction not found in bank (missing UTR)
11. `UNMATCHED_IN_PG` - Bank credit not found in PG

**Indexes:**
- `exception_id` (UNIQUE)
- `status, severity`
- `assigned_to`
- `sla_due_at`
- `merchant_id, cycle_date`

---

### 11. **sp_v2_exception_actions** (Exception Audit Log)

**Purpose:** Audit trail for exception workflow actions

**Key Columns:**
```
exception_id    : VARCHAR(50) FK → sp_v2_exception_workflow
user_id         : VARCHAR(100)
action          : VARCHAR(50) (CREATED | ASSIGNED | COMMENTED | RESOLVED | ESCALATED)
before_status   : VARCHAR(20)
after_status    : VARCHAR(20)
before_severity : VARCHAR(20)
after_severity  : VARCHAR(20)
note            : text
metadata        : jsonb
timestamp       : timestamptz
```

---

### 12. **sp_v2_exception_comments** (Exception Discussion)

**Purpose:** Comments and collaboration on exceptions

**Key Columns:**
```
exception_id : VARCHAR(50) FK → sp_v2_exception_workflow
user_id      : VARCHAR(100)
user_name    : VARCHAR(255)
comment      : text
mentions     : text[] (@ mentions)
created_at   : timestamptz
```

---

### 13. **sp_v2_exception_rules** (Auto-resolution Rules)

**Purpose:** Automated exception handling based on rules

**Key Columns:**
```
rule_name            : VARCHAR(255)
priority             : integer (100 = default)
enabled              : boolean
scope_reason_codes   : text[] (apply to these exception types)
scope_amount_delta_gt: bigint (only if delta > this)
scope_amount_delta_lt: bigint (only if delta < this)
scope_age_gt         : integer (only if age > X days)
scope_acquirers      : text[] (only for these acquirers)
scope_merchants      : text[] (only for these merchants)
scope_tags_includes  : text[] (must have these tags)
scope_severity       : text[] (only for these severities)
actions              : jsonb (auto-assign, auto-resolve, notify, etc.)
applied_count        : integer (how many times rule has matched)
```

**Example Rule:**
```json
{
  "rule_name": "Auto-resolve small rounding errors",
  "scope_reason_codes": ["ROUNDING_ERROR"],
  "scope_amount_delta_lt": 100,
  "actions": {
    "auto_resolve": true,
    "resolution": "auto_corrected",
    "notify_team": false
  }
}
```

---

### 14. **sp_v2_exception_saved_views** (Saved Filter Views)

**Purpose:** User-saved exception filter queries

**Key Columns:**
```
view_name   : VARCHAR(255)
description : text
query       : jsonb (filter criteria)
owner_id    : VARCHAR(100)
shared      : boolean (visible to all users?)
use_count   : integer (popularity metric)
```

---

### 15. **sp_v2_sla_config** (SLA Configuration)

**Purpose:** Define SLA hours for exception resolution

**Key Columns:**
```
reason           : VARCHAR(50) (exception type)
severity         : VARCHAR(20) (CRITICAL | HIGH | MEDIUM | LOW)
hours_to_resolve : integer
```

**Example:**
```
AMOUNT_MISMATCH + CRITICAL → 4 hours
AMOUNT_MISMATCH + HIGH → 24 hours
ROUNDING_ERROR + LOW → 72 hours
```

---

## Merchant Configuration Tables

### 16. **sp_v2_merchant_master** (Merchant Master Data)

**Purpose:** Core merchant information

**Key Columns:**
```
merchant_id                : VARCHAR(50) PK
merchant_name              : VARCHAR(255)
merchant_email             : VARCHAR(255)
rolling_reserve_enabled    : boolean
rolling_reserve_percentage : numeric (e.g., 10.0 for 10%)
reserve_hold_days          : integer (e.g., 7 for T+7)
settlement_cycle           : integer (daily=1, weekly=7, monthly=30)
is_active                  : boolean
synced_at                  : timestamp (last sync from V1 DB)
```

---

### 17. **sp_v2_merchant_commission_config** (MDR Configuration)

**Purpose:** Per-merchant MDR rates by payment mode

**Key Columns:**
```
merchant_id      : VARCHAR(50)
payment_mode     : VARCHAR(50) (UPI | DEBIT_CARD | CREDIT_CARD | NETBANKING)
payment_mode_id  : VARCHAR(10) (1-7, mapping to V1 IDs)
bank_code        : VARCHAR(100) (specific bank rates, optional)
commission_value : numeric (e.g., 2.0 for 2%)
commission_type  : VARCHAR(20) (percentage | flat)
gst_percentage   : numeric (default 18.0)
slab_floor       : numeric (min transaction amount for this rate)
slab_ceiling     : numeric (max transaction amount for this rate)
is_active        : boolean
```

**Example:**
```
merchant_id = MERCH001
payment_mode = UPI
commission_value = 0.5
commission_type = percentage
gst_percentage = 18.0
→ For ₹1000 UPI transaction:
   MDR = ₹5.00 (0.5%)
   GST = ₹0.90 (18% of ₹5)
   Total Fee = ₹5.90
```

**Indexes:**
- `merchant_id, payment_mode`
- `is_active`

---

### 18. **sp_v2_merchant_fee_bearer_config** (Fee Bearer Configuration)

**Purpose:** Who pays fees (merchant/customer/platform)?

**Key Columns:**
```
merchant_id     : VARCHAR(50)
payment_mode_id : VARCHAR(5)
fee_bearer_code : VARCHAR(10) (1=customer, 2=merchant, 3=custom, 4=platform)
is_active       : boolean
```

**Fee Bearer Logic:**
```
fee_bearer_code = 1 (customer)  → settlement = paid_amount (fees added on top)
fee_bearer_code = 2 (merchant)  → settlement = paid_amount - fees
fee_bearer_code = 3 (custom)    → settlement = payee_amount (custom split)
fee_bearer_code = 4 (platform)  → settlement = paid_amount (platform absorbs)
```

---

### 19. **sp_v2_merchant_settlement_config** (Settlement Configuration)

**Purpose:** Per-merchant settlement preferences

**Key Columns:**
```
merchant_id                : VARCHAR(50) UNIQUE
settlement_frequency       : VARCHAR(20) (daily | weekly | monthly)
settlement_day             : integer (1-31 for monthly, 1-7 for weekly)
settlement_time            : time (e.g., 23:00:00)
auto_settle                : boolean (automatic vs manual approval)
min_settlement_amount_paise: bigint (minimum payout threshold)
account_holder_name        : VARCHAR(200)
account_number             : VARCHAR(30)
ifsc_code                  : VARCHAR(11)
bank_name                  : VARCHAR(100)
preferred_transfer_mode    : VARCHAR(20) (NEFT | RTGS | IMPS)
is_active                  : boolean
```

---

### 20. **sp_v2_payment_mode_master** (Payment Mode Reference)

**Purpose:** Master list of payment modes with V1 IDs

**Key Columns:**
```
mode_id       : VARCHAR(10) UNIQUE (1-7 from V1)
mode_name     : VARCHAR(100) (Debit Card, Credit Card, Net Banking, etc.)
mode_category : VARCHAR(50) (CARDS | UPI | NETBANKING | WALLET | OFFLINE)
is_active     : boolean
```

**Mapping:**
```
1 → Debit Card
2 → Credit Card
3 → Net Banking
4 → CASH
5 → NEFT/RTGS
6 → UPI
7 → Wallet
```

---

## Chargeback & Disputes Tables

### 21. **sp_v2_chargebacks** (Chargeback Master)

**Purpose:** Chargeback case management

**Key Columns:**
```
id                      : UUID PK
merchant_id             : VARCHAR(100)
acquirer                : text (HDFC | ICICI | AXIS)
network_case_id         : text (Visa/Mastercard case ID)
case_ref                : VARCHAR(100) (internal reference)
txn_ref                 : text (transaction reference)
original_transaction_id : VARCHAR(255)
utr                     : VARCHAR(255)
rrn                     : VARCHAR(255)
original_gross_paise    : bigint (original transaction amount)
chargeback_paise        : bigint (disputed amount)
fees_paise              : bigint (chargeback processing fees)
recovered_paise         : bigint (amount recovered from merchant)
pending_recovery_paise  : bigint (amount still to recover)
writeoff_paise          : bigint (amount written off)
reason_code             : text (4853, 10.4, etc. - card network codes)
reason_description      : text
stage                   : text (NEW | REPRESENTMENT | PRE_ARBITRATION | ARBITRATION | CLOSED)
outcome                 : text (WON | LOST | PARTIAL | WITHDRAWN)
status                  : text (OPEN | IN_PROGRESS | RESOLVED | CLOSED)
assigned_to             : VARCHAR(100)
received_at             : timestamptz
deadline_at             : timestamptz (response deadline)
evidence_due_at         : timestamptz
responded_at            : timestamptz
closed_at               : timestamptz
tags                    : text[] (fraud, duplicate, service_issue)
```

**Chargeback Lifecycle:**
```
NEW → IN_PROGRESS → REPRESENTMENT → (WON/LOST) → CLOSED
                                 → PRE_ARBITRATION → ARBITRATION → CLOSED
```

**Indexes:**
- `merchant_id`
- `status, stage`
- `deadline_at`
- `acquirer, network_case_id` (UNIQUE)

---

### 22. **sp_v2_chargeback_representments** (Representment Tracking)

**Purpose:** Track merchant's dispute response

**Key Columns:**
```
chargeback_id           : UUID FK → sp_v2_chargebacks
submitted_at            : timestamptz
submitted_by            : VARCHAR(100)
evidence_summary        : text (summary of evidence provided)
evidence_document_count : integer
response_received_at    : timestamptz
network_response        : text (Visa/Mastercard response)
outcome                 : text (ACCEPTED | REJECTED | PARTIAL_REVERSAL)
outcome_amount_paise    : bigint
outcome_reason          : text
```

---

### 23. **sp_v2_chargeback_documents** (Evidence Documents)

**Purpose:** Store chargeback evidence (invoices, delivery proof, etc.)

**Key Columns:**
```
chargeback_id : UUID FK → sp_v2_chargebacks
kind          : text (INVOICE | PROOF_OF_DELIVERY | CUSTOMER_COMMUNICATION | etc.)
file_name     : text
file_type     : VARCHAR(50) (application/pdf, image/jpeg)
file_size_bytes: bigint
s3_bucket     : VARCHAR(255)
s3_key        : text
s3_url        : text
sha256        : text (file hash for integrity)
encrypted     : boolean
uploaded_by   : VARCHAR(100)
uploaded_at   : timestamptz
```

---

### 24. **sp_v2_recovery_actions** (Chargeback Recovery)

**Purpose:** Track recovery of chargeback amounts from merchants

**Key Columns:**
```
chargeback_id         : UUID FK → sp_v2_chargebacks
kind                  : text (SETTLEMENT_DEDUCTION | RESERVE_DEDUCTION | INVOICE | PAYMENT_LINK)
amount_paise          : bigint (amount to recover)
status                : text (QUEUED | PROCESSING | COMPLETED | FAILED)
executed_at           : timestamptz
executed_amount_paise : bigint
settlement_batch_id   : VARCHAR(100) (if deducted from settlement)
reserve_transaction_id: UUID (if deducted from reserve)
invoice_id            : VARCHAR(100)
payment_link_id       : VARCHAR(100)
notes                 : text
```

**Recovery Methods:**
1. **SETTLEMENT_DEDUCTION** - Deduct from next settlement
2. **RESERVE_DEDUCTION** - Deduct from rolling reserve
3. **INVOICE** - Raise invoice to merchant
4. **PAYMENT_LINK** - Send payment link to merchant

---

### 25. **sp_v2_settlement_deductions** (Settlement Deductions)

**Purpose:** Track chargeback deductions from settlements

**Key Columns:**
```
recovery_action_id    : UUID FK → sp_v2_recovery_actions
chargeback_id         : UUID FK → sp_v2_chargebacks
settlement_batch_id   : VARCHAR(100)
merchant_id           : VARCHAR(100)
deduction_paise       : bigint
settlement_gross_paise: bigint
max_deduction_percent : numeric (max % of settlement that can be deducted, e.g., 30%)
status                : text (PENDING | APPLIED | FAILED)
applied_at            : timestamptz
```

---

## Connector & Integration Tables

### 26. **sp_v2_connectors** (Connector Registry)

**Purpose:** Register external data connectors (SFTP, APIs)

**Key Columns:**
```
name              : VARCHAR(255)
connector_type    : VARCHAR(50) (SFTP | REST_API | WEBHOOK | DATABASE_POLL)
source_entity     : VARCHAR(100) (PG_TRANSACTIONS | BANK_STATEMENTS)
status            : VARCHAR(20) (ACTIVE | PAUSED | ERROR | DISABLED)
connection_config : jsonb (host, port, credentials, etc.)
schedule_enabled  : boolean
schedule_cron     : VARCHAR(100) (e.g., "0 19 * * *" for daily 7PM)
schedule_timezone : VARCHAR(50) (Asia/Kolkata)
last_run_at       : timestamptz
last_run_status   : VARCHAR(20) (SUCCESS | FAILURE | PARTIAL)
last_run_details  : jsonb (logs, errors, metrics)
success_count     : integer (lifetime success runs)
failure_count     : integer (lifetime failure runs)
```

**Example Connector:**
```json
{
  "name": "HDFC Bank SFTP",
  "connector_type": "SFTP",
  "source_entity": "BANK_STATEMENTS",
  "connection_config": {
    "host": "sftp.hdfcbank.com",
    "port": 22,
    "username": "settlepaisa",
    "auth_type": "key",
    "remote_path": "/incoming/",
    "file_pattern": "HDFC_MIS_*.csv"
  },
  "schedule_cron": "0 19 * * *",
  "schedule_timezone": "Asia/Kolkata"
}
```

**Indexes:**
- `connector_type`
- `status`
- `last_run_at`

---

### 27. **sp_v2_connector_runs** (Connector Execution Log)

**Purpose:** Track each connector run

**Key Columns:**
```
connector_id      : bigint FK → sp_v2_connectors
run_type          : VARCHAR(50) (SCHEDULED | MANUAL | RETRY)
run_date          : date
status            : VARCHAR(20) (RUNNING | SUCCESS | FAILURE | PARTIAL)
records_processed : integer (total records fetched)
records_success   : integer (successfully ingested)
records_failed    : integer (failed validation/ingestion)
duration_seconds  : numeric
error_message     : text
details           : jsonb (file names, row counts, errors)
started_at        : timestamptz
completed_at      : timestamptz
triggered_by      : VARCHAR(100) (USER_ID or SYSTEM)
```

**Indexes:**
- `connector_id, started_at`
- `status`

---

### 28. **sp_v2_bank_column_mappings** (Bank File Format Config)

**Purpose:** Configure how to parse bank statement files

**Key Columns:**
```
config_name        : VARCHAR(100) UNIQUE (e.g., "HDFC_POOL_ACCOUNT_MIS")
bank_name          : VARCHAR(100) (HDFC | ICICI | AXIS)
file_type          : VARCHAR(10) (CSV | XLSX | TXT | PDF)
delimiter          : VARCHAR(10) (,|;|\t for CSV)
encoding           : VARCHAR(20) (UTF-8, ISO-8859-1)
has_header         : boolean
header_row_number  : integer (which row is the header?)
v1_column_mappings : jsonb (Bank columns → V1 format → V2 format)
date_format        : VARCHAR(50) (dd-MM-yyyy, yyyy/MM/dd, etc.)
amount_format      : VARCHAR(20) (decimal | comma_separated)
special_fields     : jsonb (calculated fields, transformations)
is_active          : boolean
source             : VARCHAR(20) (V1_MIGRATED | MANUAL)
```

**Example Mapping:**
```json
{
  "config_name": "HDFC_POOL_ACCOUNT_MIS",
  "bank_name": "HDFC",
  "file_type": "CSV",
  "delimiter": ",",
  "v1_column_mappings": {
    "S.No.": "serial_number",
    "Value Date": "value_date",
    "Transaction Date": "transaction_date",
    "Cheque Number": "cheque_number",
    "Transaction Remarks": "remarks",
    "Withdrawal Amount (INR )": "debit_amount",
    "Deposit Amount (INR )": "credit_amount",
    "Balance (INR )": "closing_balance"
  },
  "date_format": "dd/MM/yyyy",
  "special_fields": {
    "utr_extraction": "REGEX from Transaction Remarks: /UTR:([A-Z0-9]+)/"
  }
}
```

---

### 29. **sp_v2_bank_files** (Bank File Registry)

**Purpose:** Track bank statement files received

**Key Columns:**
```
acquirer          : text (HDFC | ICICI | AXIS)
cycle_date        : date (date for which this file is for)
rail              : VARCHAR(10) (UPI | CARDS | NEFT | ALL)
status            : VARCHAR(20) (EXPECTED | RECEIVED | PARSED | ERROR)
file_name         : VARCHAR(255)
file_hash         : text (SHA256 for deduplication)
s3_bucket         : VARCHAR(100)
s3_key            : VARCHAR(500)
record_count      : integer
total_amount_paise: bigint
parsed_at         : timestamptz
received_at       : timestamptz
error_message     : text
```

**File Lifecycle:**
```
EXPECTED → RECEIVED → PARSED → (stored in sp_v2_bank_statements)
                    ↓
                  ERROR (if parsing fails)
```

---

## Metrics & Reporting Tables

### 30. **sp_v2_daily_kpis** (Daily Dashboard Metrics)

**Purpose:** Pre-aggregated metrics for dashboard

**Key Columns:**
```
summary_date               : date UNIQUE
total_transactions         : integer
total_amount_paise         : bigint
matched_transactions       : integer
matched_amount_paise       : bigint
unmatched_transactions     : integer
exception_transactions     : integer
match_rate_percentage      : numeric
manual_upload_transactions : integer
connector_transactions     : integer
manual_upload_matched      : integer
connector_matched          : integer
captured_count             : integer (settlement pipeline stage)
in_settlement_count        : integer
sent_to_bank_count         : integer
credited_count             : integer
unsettled_count            : integer
calculated_at              : timestamptz
```

**Calculation:**
```
match_rate_percentage = (matched_transactions / total_transactions) × 100
```

**Indexes:**
- `summary_date` (UNIQUE)

---

### 31. **sp_v2_exceptions_summary** (Exception Metrics)

**Purpose:** Daily exception aggregates by type and severity

**Key Columns:**
```
summary_date       : date
reason_code        : VARCHAR(50)
severity           : VARCHAR(20)
exception_count    : integer
total_amount_paise : bigint
manual_upload_count: integer
connector_count    : integer
```

**Indexes:**
- `summary_date, reason_code, severity` (UNIQUE)

---

### 32. **sp_v2_batch_job_logs** (Batch Job Tracking)

**Purpose:** Track scheduled batch jobs (daily sync, settlement runs)

**Key Columns:**
```
job_type                 : VARCHAR(50) (PG_DAILY_SYNC | SETTLEMENT_RUN | RECON_JOB)
job_date                 : date
merchants_processed      : integer
merchants_success        : integer
merchants_failed         : integer
total_transactions_synced: integer
duration_seconds         : numeric
status                   : VARCHAR(20) (RUNNING | SUCCESS | FAILURE | PARTIAL)
details                  : jsonb
error_message            : text
```

---

### 33. **sp_v2_sync_log** (V1→V2 Sync Log)

**Purpose:** Track data sync from V1 production database

**Key Columns:**
```
sync_type         : VARCHAR(50) (MERCHANTS | COMMISSION_CONFIG | FEE_BEARER | TRANSACTIONS)
sync_mode         : VARCHAR(20) (FULL | INCREMENTAL)
records_synced    : integer
records_updated   : integer
records_inserted  : integer
records_failed    : integer
started_at        : timestamp
completed_at      : timestamp
duration_seconds  : integer
status            : VARCHAR(20) (RUNNING | SUCCESS | FAILURE)
error_message     : text
triggered_by      : VARCHAR(100)
sync_params       : jsonb
```

---

## Data Relationships

### Settlement Flow
```
sp_v2_transactions (many)
    ↓
sp_v2_settlement_batches (one batch per merchant per cycle)
    ↓
sp_v2_settlement_items (one item per transaction)
    ↓
sp_v2_bank_transfer_queue (one transfer per batch)
    ↓
sp_v2_settlement_bank_transfers (transfer result)
```

### Reconciliation Flow
```
sp_v2_transactions (PG data)
    ↕ (reconciliation matching)
sp_v2_bank_statements (Bank data)
    ↓
sp_v2_recon_matches (if matched)
    OR
sp_v2_exception_workflow (if exception)
```

### Exception Flow
```
sp_v2_transactions (unmatched/mismatch)
    ↓
sp_v2_exception_workflow (exception record)
    ↓
sp_v2_exception_actions (audit trail)
    ↓
sp_v2_exception_comments (collaboration)
```

### Chargeback Flow
```
sp_v2_chargebacks (chargeback case)
    ↓
sp_v2_chargeback_representments (merchant response)
    ↓
sp_v2_chargeback_documents (evidence)
    ↓
sp_v2_recovery_actions (recovery attempts)
    ↓
sp_v2_settlement_deductions (actual deduction)
```

---

## Key Design Patterns

### 1. **Paise-based Amounts**
All monetary amounts stored in **paise** (1 rupee = 100 paise) to avoid floating-point errors.

```sql
-- Insert ₹1,250.50
INSERT INTO sp_v2_transactions (amount_paise) VALUES (125050);

-- Query (convert to rupees)
SELECT ROUND(amount_paise / 100.0, 2) as amount_rupees FROM sp_v2_transactions;
```

### 2. **UUID Primary Keys**
Most tables use UUID for distributed system compatibility and merge safety.

```sql
-- Auto-generated UUID
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### 3. **JSONB for Flexibility**
Flexible fields use JSONB for external system integration without schema changes.

```sql
-- Connector config (can vary by connector type)
connection_config JSONB

-- Example: SFTP config
{"host": "sftp.bank.com", "port": 22, "auth_type": "key"}

-- Example: REST API config
{"base_url": "https://api.pg.com", "auth_type": "bearer", "token": "..."}
```

### 4. **Soft Deletes**
No hard deletes. Use `is_active` or `status` for soft deletes.

```sql
-- Don't do this
DELETE FROM sp_v2_merchants WHERE merchant_id = 'MERCH001';

-- Do this
UPDATE sp_v2_merchants SET is_active = FALSE WHERE merchant_id = 'MERCH001';
```

### 5. **Audit Columns**
Track who and when for all records.

```sql
created_at    TIMESTAMPTZ DEFAULT NOW()
updated_at    TIMESTAMPTZ DEFAULT NOW()
created_by    VARCHAR(100)
updated_by    VARCHAR(100)
```

### 6. **Status Enums as VARCHAR**
Use VARCHAR for status fields (not ENUM) for flexibility.

```sql
status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'PROCESSING', 'SETTLED'))
```

### 7. **Composite Indexes**
Multi-column indexes for common query patterns.

```sql
-- Merchant dashboard query
CREATE INDEX idx_transactions_merchant_date 
ON sp_v2_transactions(merchant_id, transaction_date);

-- Exception assignment query
CREATE INDEX idx_exception_assigned 
ON sp_v2_exception_workflow(assigned_to, status);
```

### 8. **Foreign Key Constraints**
Enforce referential integrity at database level.

```sql
FOREIGN KEY (settlement_batch_id) 
REFERENCES sp_v2_settlement_batches(id) 
ON DELETE CASCADE
```

---

## Reports Powered by V2 Database

### 1. **Settlement Summary** (`/reports/settlement-summary`)
**Data Source:** `sp_v2_settlement_batches`

**Columns:**
- Cycle Date, Acquirer, Merchant
- Gross Amount, MDR+Fees, GST, PG Charges
- Rolling Reserve, Net Settlement, Txn Count

### 2. **Settlement Transactions** (`/reports/settlement-transactions`)
**Data Source:** `sp_v2_settlement_items` + `sp_v2_settlement_batches`

**Columns:**
- Txn ID, Cycle Date, Merchant, Payment Mode
- Gross Amount, MDR Fees, GST, PG Charges
- Reserve, Net Settlement, Fee Bearer

### 3. **Bank MIS** (`/reports/bank-mis`)
**Data Source:** `sp_v2_transactions`

**Columns:**
- Txn ID, UTR, PG Amount, Bank Amount
- Delta, PG Date, Bank Date, Status
- Acquirer, Merchant, Payment Method

### 4. **Recon Outcome** (`/reports/recon-outcome`)
**Data Source:** `sp_v2_transactions`

**Columns:**
- Txn ID, PG Ref, Bank Ref, Amount
- Status, Exception Type, Merchant
- Acquirer, Payment Method

### 5. **Tax Report** (`/reports/tax-report`)
**Data Source:** `sp_v2_settlement_batches`

**Columns:**
- Cycle Date, Merchant, Gross Amount
- Commission, GST Rate, GST Amount
- TDS Rate, TDS Amount, Invoice Number

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **2.16.0** | Oct 3, 2025 | Settlement Transactions report, Enhanced settlement summary with fee breakdown |
| **2.15.0** | Oct 2, 2025 | PG Auto-Sync, Daily batch jobs, Connector scheduling |
| **2.14.0** | Sep 30, 2025 | Chargeback & Disputes system, Recovery actions |
| **2.13.0** | Sep 28, 2025 | Bank column mappings, Two-stage normalization |
| **2.12.0** | Sep 25, 2025 | Exception workflow V2, 11 exception types, SLA tracking |
| **2.11.0** | Sep 22, 2025 | V1 exception persistence, Fee variance tracking |
| **2.10.0** | Sep 20, 2025 | Settlement items, Transaction-level fees, Fee bearer |

---

## Production URLs

- **Frontend:** http://localhost:5174/ops/overview
- **Recon API:** http://localhost:5103/recon/health
- **Database:** localhost:5433/settlepaisa_v2

---

## Key Metrics

| Metric | Value |
|--------|-------|
| **Total Tables** | 49 |
| **Core Transaction Tables** | 5 |
| **Settlement Tables** | 12 |
| **Exception Tables** | 7 |
| **Chargeback Tables** | 8 |
| **Connector Tables** | 5 |
| **Config Tables** | 6 |
| **Metrics Tables** | 6 |

---

**Document Version:** 1.0  
**Last Updated:** October 3, 2025  
**Generated by:** Claude Code  
**Database Version:** SettlePaisa V2.16.0
