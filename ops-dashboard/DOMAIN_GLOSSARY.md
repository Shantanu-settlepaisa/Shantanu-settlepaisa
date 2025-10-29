# SettlePaisa Domain Glossary

> **Purpose**: Single source of truth for all business and technical terms used in SettlePaisa v2.0
> **Last Updated**: 2025-10-10
> **Maintainer**: Engineering Team

## ⚠️ CRITICAL: Terminology That Caused Confusion

### ❌ WRONG: Using "Exceptions" for Unsettled Transactions
### ✅ CORRECT: "Exceptions" are ONLY reconciliation conflicts

---

## 1. RECONCILIATION DOMAIN

### Reconciliation
**Definition**: The process of matching payment gateway transactions with bank statement records.
**Purpose**: Verify that all transactions are accounted for and amounts match.
**Outcome**: Transactions are classified as MATCHED, UNMATCHED, or EXCEPTION.

### Reconciliation Status
The result of reconciliation for a single transaction:
- **MATCHED**: PG transaction matches bank record (UTR, amount, date all match)
- **UNMATCHED_PG**: Transaction exists in PG but not found in bank statement
- **UNMATCHED_BANK**: Bank record exists but no matching PG transaction
- **EXCEPTION**: Conflicts detected (duplicate UTR, amount mismatch, etc.)

### Reconciliation Exception
**Definition**: A transaction that requires manual review due to data conflicts or anomalies.
**NOT TO BE CONFUSED WITH**: Unsettled transactions (settlement status)
**Technical Field**: `status = 'EXCEPTION'` in `sp_v2_reconciliation_results`
**UI Label**: "Exceptions" (in Exceptions Card ONLY)
**Examples**:
- Duplicate UTR found
- Amount mismatch between PG and bank
- Missing UTR in transaction
- Date mismatch

**Severity Levels**:
- **CRITICAL**: Major financial discrepancy (e.g., large amount mismatch)
- **HIGH**: Data integrity issue (e.g., duplicate UTR)
- **MEDIUM**: Minor discrepancy (e.g., small amount difference)
- **LOW**: Cosmetic issue (e.g., date format mismatch)

### Match Rate
**Definition**: Percentage of transactions successfully reconciled.
**Formula**: `(matched_count / total_transactions) * 100`
**Displayed**: In "Match Rate" KPI card
**Good Range**: >95%

### Reconciliation Job
**Definition**: A batch reconciliation run for a specific date range.
**Database Table**: `sp_v2_reconciliation_jobs`
**Contains**: Summary statistics (total, matched, exceptions)

---

## 2. SETTLEMENT DOMAIN

### Settlement
**Definition**: The process of calculating and transferring funds to merchants.
**Lifecycle**: Captured → Reconciled → Settled → Sent to Bank → Credited

### Settlement Status (Transaction Level)
The current stage of a transaction in the settlement pipeline:

#### 1. **Captured** (Entry Point)
**Definition**: Transaction has been initiated and captured by the payment gateway.
**Database Status**: Various (SUCCESS, PENDING, etc.)
**Technical Field**: All transactions in `sp_v2_transactions` with valid `transaction_id`
**UI Display**: Total count in "Settlement Pipeline"

#### 2. **Reconciled** / **In Settlement**
**Definition**: Transaction has been matched with bank records and is ready for settlement.
**Database Status**: `status = 'RECONCILED'` OR has `settlement_batch_id` assigned
**Technical Field**: `reconciliation_status = 'MATCHED'` in recon tables
**UI Label**: "In Settlement" or "Reconciled"
**UI Color**: Blue (🟦)

#### 3. **Settled**
**Definition**: Transaction has been grouped into a settlement batch with fees/TDS calculated.
**Database Table**: `sp_v2_settlement_batches` with `status = 'APPROVED'` or `'SENT_TO_BANK'`
**Technical Field**: `settlement_batch_id IS NOT NULL`
**UI Label**: "Settled"
**UI Color**: Amber (🟧)

#### 4. **Sent to Bank**
**Definition**: Settlement instruction has been sent to the bank for payout.
**Database Status**: Settlement batch with `status = 'SENT_TO_BANK'`
**Technical Field**: `settlement_batch.status = 'SENT_TO_BANK'`
**UI Label**: "Sent to Bank"
**UI Color**: Yellow

#### 5. **Credited**
**Definition**: Funds have been successfully credited to merchant's bank account.
**Database Status**: Settlement batch with `status = 'CREDITED'` or `'COMPLETED'`
**Technical Field**: `settlement_batch.status = 'COMPLETED'` AND `utr IS NOT NULL`
**UI Label**: "Credited to Merchant"
**UI Color**: Green (🟩)

#### 6. **Unsettled** ⚠️ NOT "Exceptions"
**Definition**: Transaction has NOT yet entered the settlement pipeline.
**Reasons**: Pending reconciliation, failed matching, waiting for next settlement cycle
**Database Query**: Transactions NOT in any settlement batch AND not reconciled
**Technical Field**: `settlement_batch_id IS NULL` AND `status != 'RECONCILED'`
**UI Label**: "Unsettled" (NOT "Exceptions")
**UI Color**: Red (🟥)
**CONFUSION**: Previously mislabeled as "Exceptions" in Settlement Pipeline

### Settlement Batch
**Definition**: A group of transactions processed together for settlement.
**Database Table**: `sp_v2_settlement_batches`
**Contains**: Multiple transactions, fees, TDS, net amount
**Status Flow**: PENDING_APPROVAL → APPROVED → SENT_TO_BANK → CREDITED

### Settlement Pipeline
**Definition**: Visual representation of transaction distribution across settlement stages.
**Formula**: `Captured = In Settlement + Settled + Sent to Bank + Credited + Unsettled`
**Constraint**: All stages are mutually exclusive (no overlap)

### Payout
**Definition**: The actual bank transfer of funds to a merchant.
**Synonym**: Final settlement, merchant credit
**Proof**: UTR (Unique Transaction Reference) from bank

---

## 3. TRANSACTION DOMAIN

### Transaction
**Definition**: A single payment initiated by a customer.
**Database Tables**:
- `sp_v2_transactions` (manual uploads, CSV imports)
- `sp_v2_transactions_v1` (webhook ingestion from payment gateways)

### Transaction ID
**Definition**: Unique identifier for a transaction.
**Also Known As**: `transaction_id`, `pgw_ref` (in v1 table), `order_id`
**Format**: Varies by source (alphanumeric string)

### UTR (Unique Transaction Reference)
**Definition**: Bank-provided reference number confirming a successful fund transfer.
**Also Known As**: Bank Reference Number, Settlement Reference
**Purpose**: Proof of successful bank credit
**Example**: `AXISBNK12345678901234`

### Amount
**Definition**: Transaction value in the smallest currency unit.
**Technical Field**: `amount_paise` (stored as integer to avoid float precision issues)
**Display**: Convert to rupees by dividing by 100 (e.g., 150000 paise = ₹1,500.00)

### Payment Mode
**Definition**: Method used for payment.
**Values**: UPI, CARD, NETBANKING, WALLET, QR
**Technical Field**: `payment_mode` in transactions table

---

## 4. MERCHANT DOMAIN

### Merchant
**Definition**: Business entity that accepts payments through SettlePaisa.
**Database Table**: `sp_v2_merchants`
**Identifier**: `merchant_id` (UUID)

### Merchant Account
**Definition**: Bank account where settlement funds are credited.
**Required Fields**: Account number, IFSC code, account holder name

### MDR (Merchant Discount Rate)
**Definition**: Fee charged to merchant for payment processing.
**Format**: Percentage of transaction amount (e.g., 1.8%)
**Deducted**: Before settlement (from gross amount)

### TDS (Tax Deducted at Source)
**Definition**: Income tax deducted from merchant settlement as per Indian tax law.
**Rate**: Varies (typically 1% or 2%)
**Deducted**: Before settlement (from net amount after MDR)

---

## 5. ACQUIRER DOMAIN

### Acquirer
**Definition**: Bank or financial institution that processes card/UPI payments.
**Examples**: HDFC Bank, ICICI Bank, Axis Bank, SBI
**Technical Field**: `acquirer_id` in transactions

### Acquirer Bank ID
**Database Values**: `HDFC`, `ICICI`, `AXIS`, `SBI`, `KOTAK`, etc.

---

## 6. CONNECTOR DOMAIN

### Connector
**Definition**: Automated integration that fetches bank statements or transaction data.
**Types**:
- SFTP Connector (file-based)
- API Connector (REST API)
- Email Connector (parses emails)

### Connector Health
**Definition**: Current operational status of a connector.
**Status Values**:
- **HEALTHY**: Operating normally, last sync < 15 min ago
- **DEGRADED**: Delayed but functioning, last sync 15-60 min ago
- **DOWN**: Not responding, last sync > 60 min ago

### Connector Lag
**Definition**: Time difference between current time and last successful sync.
**Measured in**: Minutes
**Alert Threshold**: >60 minutes

---

## 7. DATA SOURCE DOMAIN

### Manual Upload
**Definition**: Reconciliation data uploaded via CSV files by operations team.
**Database Source**: `sp_v2_transactions` with `source_type = 'MANUAL_UPLOAD'`
**Use Case**: One-time imports, backfill data

### Connector Data
**Definition**: Reconciliation data fetched automatically by connectors.
**Database Source**: `sp_v2_transactions` with `source_type = 'CONNECTOR'`
**Frequency**: Hourly, daily (depends on connector)

### By Source
**Definition**: Breakdown of reconciliation statistics by data origin.
**Categories**: Manual Upload, Connectors, API
**UI Display**: "Reconciliation Sources" card

---

## 8. TIME & DATE DOMAIN

### Transaction Date
**Definition**: Date when the transaction was initiated.
**Technical Field**: `transaction_date` or `created_at`
**Time Zone**: Asia/Kolkata (IST)

### Settlement Date
**Definition**: Date when settlement batch was created.
**Technical Field**: `settlement_date` in `sp_v2_settlement_batches`

### Credited Date
**Definition**: Date when funds were credited to merchant account.
**Technical Field**: `credited_at` with UTR confirmation

### Time Window
**Definition**: Date range for filtering dashboard data.
**Examples**: "Last 7 days", "Last 30 days", "Today", "Custom range"
**Technical Fields**: `from` and `to` query parameters

---

## 9. KPI & METRICS DOMAIN

### KPI (Key Performance Indicator)
**Definition**: Measurable value tracking critical business metrics.
**Dashboard KPIs**:
- Match Rate (%)
- Total Transactions
- Exceptions Count
- Total Amount Reconciled

### Variance
**Definition**: Difference between total transaction amount and reconciled amount.
**Formula**: `Total Amount - Reconciled Amount`
**Unit**: Paise (₹)
**Indicator**: Financial impact of unmatched transactions

### Delta
**Definition**: Change in metric compared to previous period.
**Format**: Percentage (e.g., +2.3% or -1.5%)
**Display**: Green for positive, red for negative

---

## 10. UI & COMPONENT DOMAIN

### Card
**Definition**: UI component displaying a single metric or visualization.
**Examples**: Match Rate Card, Exceptions Card, Cash Impact Card

### Tile
**Definition**: Smaller metric display within a larger component.
**API Field**: `tiles` object in `/api/ops/overview`

### Pipeline
**Definition**: Horizontal bar chart showing transaction distribution.
**Component**: `SettlementPipeline.tsx`
**Segments**: Reconciled, Settled, Sent to Bank, Credited, Unsettled

---

## 11. DATABASE DOMAIN

### Schema: sp_v2_*
**Convention**: All SettlePaisa v2.0 tables prefixed with `sp_v2_`
**Database**: `settlepaisa_v2` on PostgreSQL

### Key Tables
- `sp_v2_transactions` - Manual upload transactions
- `sp_v2_transactions_v1` - Webhook/PG transactions
- `sp_v2_reconciliation_jobs` - Reconciliation batch runs
- `sp_v2_reconciliation_results` - Per-transaction recon results
- `sp_v2_settlement_batches` - Settlement batches
- `sp_v2_settlement_items` - Individual transactions in a batch
- `sp_v2_merchants` - Merchant accounts

---

## 12. API DOMAIN

### API Endpoint Naming
**Convention**: `/api/{domain}/{resource}`
**Examples**:
- `/api/overview` - Overview data (simple)
- `/api/ops/overview` - Operations overview (detailed)
- `/api/kpis` - Key performance indicators
- `/api/recon-results/{source}` - Reconciliation results

### API Response Structure
**Standard Fields**:
- `timeRange` - Date range for the data
- `window` - Time window metadata
- `tiles` - KPI metrics
- `pipeline` - Settlement distribution
- `bySource` - Source-wise breakdown

---

## USAGE RULES

### ✅ DO:
- Use "Reconciliation Exception" for data conflicts
- Use "Unsettled" for transactions not in settlement pipeline
- Use "Credited" for successfully paid out transactions
- Check this glossary before naming any new field/component

### ❌ DON'T:
- Use "Exceptions" for settlement status
- Mix reconciliation and settlement terminology
- Use "Settled" and "Credited" interchangeably
- Create new terms without adding to this glossary

---

## CROSS-REFERENCES

| Old/Ambiguous Term | Correct Term | Context |
|-------------------|--------------|---------|
| "Exceptions" (in pipeline) | "Unsettled" | Settlement status |
| "Exceptions" (in card) | "Reconciliation Exceptions" | Recon conflicts |
| "Matched" | "Reconciled" | Settlement stage |
| "Sent" | "Sent to Bank" | Settlement stage |
| "Paid" | "Credited" | Settlement stage |
| "Failed" | "Unsettled" or "Exception" | Depends on context |

---

## GLOSSARY UPDATES

**How to Update**:
1. Identify new term or ambiguity
2. Define clearly with examples
3. Add to appropriate section
4. Update CROSS-REFERENCES if needed
5. Notify team in #engineering Slack

**Review Schedule**: Monthly during sprint planning

---

**Version**: 1.0.0
**Contributors**: Engineering Team
**Last Review**: 2025-10-10
