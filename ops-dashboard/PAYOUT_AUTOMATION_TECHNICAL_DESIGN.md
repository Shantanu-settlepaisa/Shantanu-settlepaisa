# Payout Automation Technical Design
## SettlePaisa 2.0 - Phase 2 Implementation

**Created:** October 22, 2025
**Status:** Technical Design Document
**Phase:** Phase 2 (Week 2-3)
**Depends On:** Phase 1 completion (chargeback deduction, instant settlement intelligence, transfer mode router)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Bank File Format Specifications](#bank-file-format-specifications)
4. [File Generation Logic](#file-generation-logic)
5. [SFTP Integration](#sftp-integration)
6. [Payout Processor Service](#payout-processor-service)
7. [Error Handling & Retry Logic](#error-handling--retry-logic)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Security & Compliance](#security--compliance)
10. [Database Schema](#database-schema)
11. [Implementation Timeline](#implementation-timeline)
12. [Testing Strategy](#testing-strategy)

---

## Executive Summary

### Purpose
Automate the end-to-end payout process from approved settlement batches to bank transfers, replacing V1's manual "mark as paid" approach with actual NEFT/RTGS/IMPS file generation and bank submission.

### Goals
- **Automation**: Zero manual intervention for approved settlements
- **Reliability**: Retry logic, idempotency, transaction safety
- **Compliance**: Proper file formats, encryption, audit trails
- **Visibility**: Real-time status tracking, reconciliation, alerting

### Current State (Post Phase 1)
```
Settlement Batch (APPROVED)
    ↓
sp_v2_settlement_bank_transfers (PENDING)
    ↓
    ❌ STOPS HERE - No file generation, no bank submission
```

### Target State (Post Phase 2)
```
Settlement Batch (APPROVED)
    ↓
Bank Transfer Record (PENDING)
    ↓
File Generator → NEFT/RTGS/IMPS file
    ↓
SFTP Upload → Bank server
    ↓
Status Poller → Updates status
    ↓
Settlement Batch (PAID) / Bank Transfer (COMPLETED)
```

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAYOUT AUTOMATION SYSTEM                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   Settlement Engine  │ ← Phase 1 output
│  (Creates PENDING    │
│   bank_transfers)    │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────────┐
│                   PAYOUT PROCESSOR (New Service)                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  File Generator │  │  SFTP Uploader   │  │  Status Poller  │ │
│  │  (NEFT/RTGS/    │→ │  (Bank Servers)  │→ │  (Response      │ │
│  │   IMPS formats) │  │                  │  │   Files)        │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
│           ↓                     ↓                     ↓          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Database: sp_v2_payout_files                   │ │
│  │         Track file generation, upload, bank responses       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────┐
│   Bank SFTP Server   │
│   (HDFC/ICICI/Axis)  │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│   Bank Response      │
│   (Success/Failure)  │
└──────────────────────┘
```

### Service Responsibilities

| Component | Responsibility | Runs |
|-----------|---------------|------|
| **File Generator** | Create NEFT/RTGS/IMPS files from pending transfers | On-demand + Scheduled (every 30 min) |
| **SFTP Uploader** | Upload files to bank servers, handle errors | Immediately after file generation |
| **Status Poller** | Download response files, update transfer status | Scheduled (every 15 min) |
| **Retry Handler** | Reprocess failed uploads, handle bank errors | Scheduled (every 1 hour) |

---

## Bank File Format Specifications

### NEFT File Format (SFMS Standard)

**Format:** Fixed-width text file
**Extension:** `.txt`
**Character Encoding:** ASCII
**Line Ending:** CRLF (`\r\n`)

#### File Structure

```
Header Record (H)
    ↓
Batch Header (BH)
    ↓
Transaction Records (T) [1 to N]
    ↓
Batch Trailer (BT)
    ↓
File Trailer (FT)
```

#### Record Specifications

**Header Record (H) - 135 characters**
```
Position  Length  Field Name              Example
1-1       1       Record Type             "H"
2-6       5       Priority Code           "00000"
7-16      10      Destination Code        "HDFC0000001"
17-26     10      Originator Code         "SABP0000001"
27-36     10      File Reference          "2025102201"
37-44     8       File Date (YYYYMMDD)    "20251022"
45-48     4       File Time (HHMM)        "1430"
49-135    87      Filler                  (spaces)
```

**Batch Header (BH) - 135 characters**
```
Position  Length  Field Name              Example
1-2       2       Record Type             "BH"
3-12      10      Client Code             "SABPAISA01"
13-42     30      Client Name             "SABPAISA MERCHANT SERVICES PV"
43-52     10      Product Code            "NEFT"
53-62     10      Batch Reference         "B202510221"
63-70     8       Value Date (YYYYMMDD)   "20251022"
71-135    65      Filler                  (spaces)
```

**Transaction Record (T) - 135 characters**
```
Position  Length  Field Name                  Example
1-1       1       Record Type                 "T"
2-3       2       Transaction Type            "01" (Credit)
4-19      16      Beneficiary Account         "12345678901234  "
20-54     35      Beneficiary Name            "MERCHANT ABC PRIVATE LIMITED  "
55-64     10      Beneficiary IFSC            "HDFC0001234"
65-77     13      Amount (Paise)              "0000100000000" (₹10,00,000.00)
78-107    30      Sender to Receiver Info     "Settlement for Oct 21        "
108-117   10      Client Reference            "S202510210"
118-125   8       Transaction Date            "20251022"
126-135   10      Filler                      (spaces)
```

**Batch Trailer (BT) - 135 characters**
```
Position  Length  Field Name              Example
1-2       2       Record Type             "BT"
3-12      10      Batch Reference         "B202510221"
13-20     8       Transaction Count       "00000025"
21-33     13      Batch Total (Paise)     "0002500000000" (₹25,00,000.00)
34-135    102     Filler                  (spaces)
```

**File Trailer (FT) - 135 characters**
```
Position  Length  Field Name              Example
1-2       2       Record Type             "FT"
3-12      10      File Reference          "2025102201"
13-20     8       Batch Count             "00000001"
21-28     8       Total Transactions      "00000025"
29-41     13      File Total (Paise)      "0002500000000"
42-135    94      Filler                  (spaces)
```

#### Example Complete NEFT File

```
H00000HDFC0000001SABP00000012025102201202510221430
BHSABPAISA01SABPAISA MERCHANT SERVICES PVNEFT      B20251022120251022
T0112345678901234  MERCHANT ABC PRIVATE LIMITED   HDFC00012340000100000000Settlement for Oct 21        S20251021020251022
T0187654321098765  RETAILER XYZ LLP               ICIC00056780000050000000Settlement for Oct 21        S20251021120251022
BT          B20251022100000002000015000000
FT          202510220100000002000015000000
```

---

### RTGS File Format (SFMS Standard)

**Format:** Fixed-width text file (similar to NEFT)
**Extension:** `.txt`
**Key Differences from NEFT:**
1. Product Code = "RTGS" (instead of "NEFT")
2. Minimum amount: ₹2,00,000 (enforced in validation)
3. Time window validation: 9:00 AM - 4:30 PM on banking days
4. Faster processing (real-time gross settlement)

#### Transaction Record Differences

```
Position  Length  Field Name                  Example
1-1       1       Record Type                 "T"
2-3       2       Transaction Type            "01" (Credit)
...
52-54     3       Transaction Priority        "001" (High priority)
55-64     10      Beneficiary IFSC            "HDFC0001234"
65-77     13      Amount (Paise)              "0020000000000" (₹20,00,000.00)
...
```

**File Naming Convention:**
```
RTGS_<CLIENT_CODE>_<DATE>_<SEQUENCE>.txt

Example: RTGS_SABPAISA01_20251022_001.txt
```

---

### IMPS File Format (NPCI Standard)

**Format:** XML (ISO 20022 pain.001.001.03)
**Extension:** `.xml`
**Character Encoding:** UTF-8

#### XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <!-- Group Header -->
    <GrpHdr>
      <MsgId>SABPAISA_20251022_143000_001</MsgId>
      <CreDtTm>2025-10-22T14:30:00</CreDtTm>
      <NbOfTxs>10</NbOfTxs>
      <CtrlSum>500000.00</CtrlSum>
      <InitgPty>
        <Nm>SABPAISA MERCHANT SERVICES</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>SABPAISA01</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>

    <!-- Payment Information -->
    <PmtInf>
      <PmtInfId>BATCH_20251022_001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>10</NbOfTxs>
      <CtrlSum>500000.00</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>IMPS</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>2025-10-22</ReqdExctnDt>

      <!-- Debtor Account -->
      <Dbtr>
        <Nm>SABPAISA MERCHANT SERVICES</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>98765432109876</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <ClrSysMmbId>
            <MmbId>HDFC0000001</MmbId>
          </ClrSysMmbId>
        </FinInstnId>
      </DbtrAgt>

      <!-- Credit Transfer Transactions -->
      <CdtTrfTxInf>
        <PmtId>
          <InstrId>TXN_20251022_001</InstrId>
          <EndToEndId>S2025102101</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="INR">100000.00</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <ClrSysMmbId>
              <MmbId>HDFC0001234</MmbId>
            </ClrSysMmbId>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>MERCHANT ABC PRIVATE LIMITED</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>12345678901234</Id>
            </Othr>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>Settlement for Oct 21</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>

      <!-- Additional transactions... -->

    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
```

#### IMPS Constraints

```javascript
const IMPS_CONSTRAINTS = {
  maxAmountPaise: 20000000,        // ₹2,00,000 max per transaction
  minAmountPaise: 100,             // ₹1 minimum
  maxTransactionsPerFile: 100,     // NPCI limit
  availabilityHours: '24x7',       // Always available
  settlementTime: '15 minutes'     // SLA
};
```

**File Naming Convention:**
```
IMPS_<CLIENT_CODE>_<TIMESTAMP>_<SEQUENCE>.xml

Example: IMPS_SABPAISA01_20251022143000_001.xml
```

---

## File Generation Logic

### Service: Payout File Generator

**Location:** `services/payout-processor/file-generator.cjs`

### Core Functions

#### 1. Main Generation Function

```javascript
/**
 * Generate payout files for pending bank transfers
 * Groups by transfer_mode (NEFT/RTGS/IMPS) and bank
 *
 * @returns {Object} { filesGenerated, totalTransfers, errors }
 */
async function generatePayoutFiles() {
  const pool = getDbPool();

  // 1. Fetch pending transfers grouped by mode and bank
  const pendingTransfers = await pool.query(`
    SELECT
      bt.id,
      bt.settlement_batch_id,
      bt.merchant_id,
      bt.amount_paise,
      bt.transfer_mode,
      mc.bank_account_number,
      mc.bank_ifsc_code,
      mc.bank_account_name,
      mc.merchant_name,
      sb.batch_reference,
      sb.settlement_type
    FROM sp_v2_settlement_bank_transfers bt
    JOIN sp_v2_merchant_configs mc ON bt.merchant_id = mc.merchant_id
    JOIN sp_v2_settlement_batches sb ON bt.settlement_batch_id = sb.id
    WHERE bt.status = 'PENDING'
      AND bt.file_id IS NULL  -- Not yet included in any file
      AND mc.bank_account_number IS NOT NULL
      AND mc.bank_ifsc_code IS NOT NULL
    ORDER BY
      CASE bt.transfer_mode
        WHEN 'IMPS' THEN 1    -- Instant settlements first
        WHEN 'RTGS' THEN 2
        WHEN 'NEFT' THEN 3
      END,
      bt.initiated_at ASC
  `);

  if (pendingTransfers.rows.length === 0) {
    return { filesGenerated: 0, totalTransfers: 0, errors: [] };
  }

  // 2. Group transfers by mode
  const groupedByMode = {};
  for (const transfer of pendingTransfers.rows) {
    const mode = transfer.transfer_mode;
    if (!groupedByMode[mode]) {
      groupedByMode[mode] = [];
    }
    groupedByMode[mode].push(transfer);
  }

  const results = {
    filesGenerated: 0,
    totalTransfers: 0,
    errors: []
  };

  // 3. Generate files for each mode
  for (const [mode, transfers] of Object.entries(groupedByMode)) {
    try {
      if (mode === 'NEFT') {
        await generateNEFTFiles(transfers, results);
      } else if (mode === 'RTGS') {
        await generateRTGSFiles(transfers, results);
      } else if (mode === 'IMPS') {
        await generateIMPSFiles(transfers, results);
      }
    } catch (error) {
      results.errors.push({
        mode,
        error: error.message,
        transferCount: transfers.length
      });
    }
  }

  return results;
}
```

#### 2. NEFT File Generator

```javascript
/**
 * Generate NEFT files (max 100 transactions per file)
 */
async function generateNEFTFiles(transfers, results) {
  const pool = getDbPool();
  const BATCH_SIZE = 100;
  const fileDate = new Date();
  const fileDateStr = fileDate.toISOString().slice(0, 10).replace(/-/g, '');

  // Split into batches
  for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
    const batch = transfers.slice(i, i + BATCH_SIZE);
    const sequenceNum = String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0');

    // Generate file reference
    const fileReference = `${fileDateStr}${sequenceNum}`;
    const fileName = `NEFT_SABPAISA01_${fileDateStr}_${sequenceNum}.txt`;
    const filePath = `/tmp/payout_files/${fileName}`;

    // Build file content
    let content = '';

    // Header Record
    content += buildNEFTHeader(fileReference, fileDate);

    // Batch Header
    const batchReference = `B${fileReference}`;
    content += buildNEFTBatchHeader(batchReference, fileDate);

    // Transaction Records
    let batchTotalPaise = 0;
    for (const transfer of batch) {
      content += buildNEFTTransaction(transfer, fileDate);
      batchTotalPaise += transfer.amount_paise;
    }

    // Batch Trailer
    content += buildNEFTBatchTrailer(batchReference, batch.length, batchTotalPaise);

    // File Trailer
    content += buildNEFTFileTrailer(fileReference, 1, batch.length, batchTotalPaise);

    // Write file
    await fs.writeFile(filePath, content, 'ascii');

    // Create payout_files record
    const fileRecord = await pool.query(`
      INSERT INTO sp_v2_payout_files (
        id, file_name, file_path, file_type, file_reference,
        transaction_count, total_amount_paise, status, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, 'NEFT', $3, $4, $5, 'GENERATED', NOW()
      ) RETURNING id
    `, [fileName, filePath, fileReference, batch.length, batchTotalPaise]);

    const fileId = fileRecord.rows[0].id;

    // Link transfers to file
    const transferIds = batch.map(t => t.id);
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET file_id = $1, status = 'FILE_GENERATED', updated_at = NOW()
      WHERE id = ANY($2)
    `, [fileId, transferIds]);

    results.filesGenerated++;
    results.totalTransfers += batch.length;

    console.log(`[NEFT Generator] Created ${fileName} with ${batch.length} transactions, total ₹${(batchTotalPaise / 100).toFixed(2)}`);
  }
}

/**
 * Build NEFT Header Record (135 chars)
 */
function buildNEFTHeader(fileReference, fileDate) {
  const parts = [
    'H',                                          // Record Type (1)
    '00000',                                      // Priority (5)
    'HDFC0000001',                                // Destination Bank (10)
    'SABP000001',                                 // Originator Code (10)
    fileReference.padEnd(10, ' '),                // File Reference (10)
    fileDate.toISOString().slice(0, 10).replace(/-/g, ''), // Date YYYYMMDD (8)
    fileDate.toTimeString().slice(0, 5).replace(/:/g, ''),  // Time HHMM (4)
    ''.padEnd(87, ' ')                            // Filler (87)
  ];
  return parts.join('') + '\r\n';
}

/**
 * Build NEFT Batch Header (135 chars)
 */
function buildNEFTBatchHeader(batchReference, valueDate) {
  const parts = [
    'BH',                                         // Record Type (2)
    'SABPAISA01',                                 // Client Code (10)
    'SABPAISA MERCHANT SERVICES PV'.padEnd(30, ' '), // Client Name (30)
    'NEFT      ',                                 // Product Code (10)
    batchReference.padEnd(10, ' '),               // Batch Reference (10)
    valueDate.toISOString().slice(0, 10).replace(/-/g, ''), // Value Date (8)
    ''.padEnd(65, ' ')                            // Filler (65)
  ];
  return parts.join('') + '\r\n';
}

/**
 * Build NEFT Transaction Record (135 chars)
 */
function buildNEFTTransaction(transfer, txnDate) {
  const parts = [
    'T',                                          // Record Type (1)
    '01',                                         // Transaction Type (2) - Credit
    transfer.bank_account_number.padEnd(16, ' '), // Account Number (16)
    transfer.bank_account_name.substring(0, 35).padEnd(35, ' '), // Name (35)
    transfer.bank_ifsc_code.padEnd(10, ' '),      // IFSC (10)
    String(transfer.amount_paise).padStart(13, '0'), // Amount in paise (13)
    `Settlement ${transfer.batch_reference}`.substring(0, 30).padEnd(30, ' '), // Remarks (30)
    transfer.batch_reference.substring(0, 10).padEnd(10, ' '), // Client Ref (10)
    txnDate.toISOString().slice(0, 10).replace(/-/g, ''), // Transaction Date (8)
    ''.padEnd(10, ' ')                            // Filler (10)
  ];
  return parts.join('') + '\r\n';
}

/**
 * Build NEFT Batch Trailer (135 chars)
 */
function buildNEFTBatchTrailer(batchReference, txnCount, totalPaise) {
  const parts = [
    'BT',                                         // Record Type (2)
    batchReference.padEnd(10, ' '),               // Batch Reference (10)
    String(txnCount).padStart(8, '0'),            // Transaction Count (8)
    String(totalPaise).padStart(13, '0'),         // Batch Total (13)
    ''.padEnd(102, ' ')                           // Filler (102)
  ];
  return parts.join('') + '\r\n';
}

/**
 * Build NEFT File Trailer (135 chars)
 */
function buildNEFTFileTrailer(fileReference, batchCount, txnCount, totalPaise) {
  const parts = [
    'FT',                                         // Record Type (2)
    fileReference.padEnd(10, ' '),                // File Reference (10)
    String(batchCount).padStart(8, '0'),          // Batch Count (8)
    String(txnCount).padStart(8, '0'),            // Total Transactions (8)
    String(totalPaise).padStart(13, '0'),         // File Total (13)
    ''.padEnd(94, ' ')                            // Filler (94)
  ];
  return parts.join('') + '\r\n';
}
```

#### 3. RTGS File Generator

```javascript
/**
 * Generate RTGS files (similar to NEFT but with RTGS constraints)
 */
async function generateRTGSFiles(transfers, results) {
  // Validate RTGS constraints
  const validTransfers = [];
  const invalidTransfers = [];

  for (const transfer of transfers) {
    // Check minimum amount (₹2 lakh)
    if (transfer.amount_paise < 20000000) {
      invalidTransfers.push({
        transferId: transfer.id,
        reason: 'Below RTGS minimum (₹2,00,000)',
        amount: transfer.amount_paise
      });
      continue;
    }

    // Check banking hours (9:00 AM - 4:30 PM, Mon-Fri)
    if (!isRTGSHours()) {
      invalidTransfers.push({
        transferId: transfer.id,
        reason: 'Outside RTGS hours (9:00 AM - 4:30 PM)',
        currentTime: new Date().toISOString()
      });
      continue;
    }

    validTransfers.push(transfer);
  }

  // Mark invalid transfers to retry later
  if (invalidTransfers.length > 0) {
    const pool = getDbPool();
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET
        status = 'VALIDATION_FAILED',
        error_message = $1,
        retry_count = retry_count + 1,
        next_retry_at = NOW() + INTERVAL '1 hour'
      WHERE id = ANY($2)
    `, [
      JSON.stringify(invalidTransfers),
      invalidTransfers.map(t => t.transferId)
    ]);
  }

  if (validTransfers.length === 0) {
    return;
  }

  // Generate RTGS files (same format as NEFT, different product code)
  const BATCH_SIZE = 50; // RTGS typically smaller batches
  const fileDate = new Date();
  const fileDateStr = fileDate.toISOString().slice(0, 10).replace(/-/g, '');

  for (let i = 0; i < validTransfers.length; i += BATCH_SIZE) {
    const batch = validTransfers.slice(i, i + BATCH_SIZE);
    const sequenceNum = String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0');

    const fileReference = `${fileDateStr}${sequenceNum}`;
    const fileName = `RTGS_SABPAISA01_${fileDateStr}_${sequenceNum}.txt`;
    const filePath = `/tmp/payout_files/${fileName}`;

    let content = '';
    content += buildRTGSHeader(fileReference, fileDate);

    const batchReference = `R${fileReference}`;
    content += buildRTGSBatchHeader(batchReference, fileDate);

    let batchTotalPaise = 0;
    for (const transfer of batch) {
      content += buildRTGSTransaction(transfer, fileDate);
      batchTotalPaise += transfer.amount_paise;
    }

    content += buildRTGSBatchTrailer(batchReference, batch.length, batchTotalPaise);
    content += buildRTGSFileTrailer(fileReference, 1, batch.length, batchTotalPaise);

    await fs.writeFile(filePath, content, 'ascii');

    const pool = getDbPool();
    const fileRecord = await pool.query(`
      INSERT INTO sp_v2_payout_files (
        id, file_name, file_path, file_type, file_reference,
        transaction_count, total_amount_paise, status, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, 'RTGS', $3, $4, $5, 'GENERATED', NOW()
      ) RETURNING id
    `, [fileName, filePath, fileReference, batch.length, batchTotalPaise]);

    const fileId = fileRecord.rows[0].id;

    const transferIds = batch.map(t => t.id);
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET file_id = $1, status = 'FILE_GENERATED', updated_at = NOW()
      WHERE id = ANY($2)
    `, [fileId, transferIds]);

    results.filesGenerated++;
    results.totalTransfers += batch.length;

    console.log(`[RTGS Generator] Created ${fileName} with ${batch.length} transactions, total ₹${(batchTotalPaise / 100).toFixed(2)}`);
  }
}

/**
 * Check if current time is within RTGS hours
 */
function isRTGSHours() {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday, 6=Saturday

  // Not on weekends
  if (day === 0 || day === 6) {
    return false;
  }

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const startMinutes = 9 * 60;      // 9:00 AM
  const endMinutes = 16 * 60 + 30;  // 4:30 PM

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// RTGS record builders (similar to NEFT, with "RTGS" product code)
function buildRTGSHeader(fileReference, fileDate) {
  // Same as NEFT
  return buildNEFTHeader(fileReference, fileDate);
}

function buildRTGSBatchHeader(batchReference, valueDate) {
  const parts = [
    'BH',
    'SABPAISA01',
    'SABPAISA MERCHANT SERVICES PV'.padEnd(30, ' '),
    'RTGS      ', // ← Different from NEFT
    batchReference.padEnd(10, ' '),
    valueDate.toISOString().slice(0, 10).replace(/-/g, ''),
    ''.padEnd(65, ' ')
  ];
  return parts.join('') + '\r\n';
}

function buildRTGSTransaction(transfer, txnDate) {
  // Same format as NEFT
  return buildNEFTTransaction(transfer, txnDate);
}

function buildRTGSBatchTrailer(batchReference, txnCount, totalPaise) {
  return buildNEFTBatchTrailer(batchReference, txnCount, totalPaise);
}

function buildRTGSFileTrailer(fileReference, batchCount, txnCount, totalPaise) {
  return buildNEFTFileTrailer(fileReference, batchCount, txnCount, totalPaise);
}
```

#### 4. IMPS File Generator

```javascript
/**
 * Generate IMPS XML files (ISO 20022 format)
 */
async function generateIMPSFiles(transfers, results) {
  const validTransfers = [];
  const invalidTransfers = [];

  for (const transfer of transfers) {
    // Check IMPS maximum (₹2 lakh)
    if (transfer.amount_paise > 20000000) {
      invalidTransfers.push({
        transferId: transfer.id,
        reason: 'Exceeds IMPS maximum (₹2,00,000)',
        amount: transfer.amount_paise
      });
      continue;
    }

    validTransfers.push(transfer);
  }

  // Mark invalid transfers
  if (invalidTransfers.length > 0) {
    const pool = getDbPool();
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET
        status = 'VALIDATION_FAILED',
        error_message = $1,
        retry_count = retry_count + 1,
        next_retry_at = NOW() + INTERVAL '30 minutes'
      WHERE id = ANY($2)
    `, [
      JSON.stringify(invalidTransfers),
      invalidTransfers.map(t => t.transferId)
    ]);
  }

  if (validTransfers.length === 0) {
    return;
  }

  // Generate IMPS XML files
  const BATCH_SIZE = 100;
  const fileDate = new Date();
  const timestamp = fileDate.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '');

  for (let i = 0; i < validTransfers.length; i += BATCH_SIZE) {
    const batch = validTransfers.slice(i, i + BATCH_SIZE);
    const sequenceNum = String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0');

    const fileName = `IMPS_SABPAISA01_${timestamp}_${sequenceNum}.xml`;
    const filePath = `/tmp/payout_files/${fileName}`;

    const xmlContent = buildIMPSXML(batch, fileDate, sequenceNum);

    await fs.writeFile(filePath, xmlContent, 'utf8');

    const batchTotalPaise = batch.reduce((sum, t) => sum + t.amount_paise, 0);

    const pool = getDbPool();
    const fileRecord = await pool.query(`
      INSERT INTO sp_v2_payout_files (
        id, file_name, file_path, file_type, file_reference,
        transaction_count, total_amount_paise, status, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, 'IMPS', $3, $4, $5, 'GENERATED', NOW()
      ) RETURNING id
    `, [fileName, filePath, `IMPS_${timestamp}_${sequenceNum}`, batch.length, batchTotalPaise]);

    const fileId = fileRecord.rows[0].id;

    const transferIds = batch.map(t => t.id);
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET file_id = $1, status = 'FILE_GENERATED', updated_at = NOW()
      WHERE id = ANY($2)
    `, [fileId, transferIds]);

    results.filesGenerated++;
    results.totalTransfers += batch.length;

    console.log(`[IMPS Generator] Created ${fileName} with ${batch.length} transactions, total ₹${(batchTotalPaise / 100).toFixed(2)}`);
  }
}

/**
 * Build IMPS XML content (ISO 20022 pain.001.001.03)
 */
function buildIMPSXML(transfers, fileDate, sequenceNum) {
  const timestamp = fileDate.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '');
  const msgId = `SABPAISA_${timestamp}_${sequenceNum}`;
  const batchId = `BATCH_${timestamp}_${sequenceNum}`;

  const totalAmount = transfers.reduce((sum, t) => sum + t.amount_paise, 0) / 100;
  const txnCount = transfers.length;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">\n';
  xml += '  <CstmrCdtTrfInitn>\n';

  // Group Header
  xml += '    <GrpHdr>\n';
  xml += `      <MsgId>${msgId}</MsgId>\n`;
  xml += `      <CreDtTm>${fileDate.toISOString()}</CreDtTm>\n`;
  xml += `      <NbOfTxs>${txnCount}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>\n`;
  xml += '      <InitgPty>\n';
  xml += '        <Nm>SABPAISA MERCHANT SERVICES</Nm>\n';
  xml += '        <Id>\n';
  xml += '          <OrgId>\n';
  xml += '            <Othr>\n';
  xml += '              <Id>SABPAISA01</Id>\n';
  xml += '            </Othr>\n';
  xml += '          </OrgId>\n';
  xml += '        </Id>\n';
  xml += '      </InitgPty>\n';
  xml += '    </GrpHdr>\n';

  // Payment Information
  xml += '    <PmtInf>\n';
  xml += `      <PmtInfId>${batchId}</PmtInfId>\n`;
  xml += '      <PmtMtd>TRF</PmtMtd>\n';
  xml += '      <BtchBookg>true</BtchBookg>\n';
  xml += `      <NbOfTxs>${txnCount}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>\n`;
  xml += '      <PmtTpInf>\n';
  xml += '        <SvcLvl>\n';
  xml += '          <Cd>IMPS</Cd>\n';
  xml += '        </SvcLvl>\n';
  xml += '      </PmtTpInf>\n';
  xml += `      <ReqdExctnDt>${fileDate.toISOString().slice(0, 10)}</ReqdExctnDt>\n`;

  // Debtor (SabPaisa account)
  xml += '      <Dbtr>\n';
  xml += '        <Nm>SABPAISA MERCHANT SERVICES</Nm>\n';
  xml += '      </Dbtr>\n';
  xml += '      <DbtrAcct>\n';
  xml += '        <Id>\n';
  xml += '          <Othr>\n';
  xml += '            <Id>98765432109876</Id>\n'; // TODO: Get from config
  xml += '          </Othr>\n';
  xml += '        </Id>\n';
  xml += '      </DbtrAcct>\n';
  xml += '      <DbtrAgt>\n';
  xml += '        <FinInstnId>\n';
  xml += '          <ClrSysMmbId>\n';
  xml += '            <MmbId>HDFC0000001</MmbId>\n'; // TODO: Get from config
  xml += '          </ClrSysMmbId>\n';
  xml += '        </FinInstnId>\n';
  xml += '      </DbtrAgt>\n';

  // Credit Transfer Transactions
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    const amount = (transfer.amount_paise / 100).toFixed(2);
    const txnId = `TXN_${timestamp}_${String(i + 1).padStart(4, '0')}`;

    xml += '      <CdtTrfTxInf>\n';
    xml += '        <PmtId>\n';
    xml += `          <InstrId>${txnId}</InstrId>\n`;
    xml += `          <EndToEndId>${transfer.batch_reference}</EndToEndId>\n`;
    xml += '        </PmtId>\n';
    xml += '        <Amt>\n';
    xml += `          <InstdAmt Ccy="INR">${amount}</InstdAmt>\n`;
    xml += '        </Amt>\n';
    xml += '        <CdtrAgt>\n';
    xml += '          <FinInstnId>\n';
    xml += '            <ClrSysMmbId>\n';
    xml += `              <MmbId>${transfer.bank_ifsc_code}</MmbId>\n`;
    xml += '            </ClrSysMmbId>\n';
    xml += '          </FinInstnId>\n';
    xml += '        </CdtrAgt>\n';
    xml += '        <Cdtr>\n';
    xml += `          <Nm>${escapeXML(transfer.bank_account_name)}</Nm>\n`;
    xml += '        </Cdtr>\n';
    xml += '        <CdtrAcct>\n';
    xml += '          <Id>\n';
    xml += '            <Othr>\n';
    xml += `              <Id>${transfer.bank_account_number}</Id>\n`;
    xml += '            </Othr>\n';
    xml += '          </Id>\n';
    xml += '        </CdtrAcct>\n';
    xml += '        <RmtInf>\n';
    xml += `          <Ustrd>Settlement ${transfer.batch_reference}</Ustrd>\n`;
    xml += '        </RmtInf>\n';
    xml += '      </CdtTrfTxInf>\n';
  }

  xml += '    </PmtInf>\n';
  xml += '  </CstmrCdtTrfInitn>\n';
  xml += '</Document>\n';

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

---

## SFTP Integration

### Service: SFTP Uploader

**Location:** `services/payout-processor/sftp-uploader.cjs`

### Bank SFTP Configuration

```javascript
const BANK_SFTP_CONFIGS = {
  HDFC: {
    host: process.env.HDFC_SFTP_HOST || 'sftp.hdfcbank.com',
    port: parseInt(process.env.HDFC_SFTP_PORT || '22'),
    username: process.env.HDFC_SFTP_USER,
    password: process.env.HDFC_SFTP_PASSWORD,
    privateKey: process.env.HDFC_SFTP_KEY_PATH
      ? fs.readFileSync(process.env.HDFC_SFTP_KEY_PATH)
      : null,
    uploadPath: '/upload/neft',
    rtgsPath: '/upload/rtgs',
    impsPath: '/upload/imps',
    responsePath: '/download/responses',
    retryAttempts: 3,
    retryDelayMs: 5000
  },
  ICICI: {
    host: process.env.ICICI_SFTP_HOST || 'sftp.icicibank.com',
    port: parseInt(process.env.ICICI_SFTP_PORT || '22'),
    username: process.env.ICICI_SFTP_USER,
    password: process.env.ICICI_SFTP_PASSWORD,
    privateKey: process.env.ICICI_SFTP_KEY_PATH
      ? fs.readFileSync(process.env.ICICI_SFTP_KEY_PATH)
      : null,
    uploadPath: '/inbound/payments',
    responsePath: '/outbound/responses',
    retryAttempts: 3,
    retryDelayMs: 5000
  },
  AXIS: {
    host: process.env.AXIS_SFTP_HOST || 'sftp.axisbank.com',
    port: parseInt(process.env.AXIS_SFTP_PORT || '22'),
    username: process.env.AXIS_SFTP_USER,
    password: process.env.AXIS_SFTP_PASSWORD,
    privateKey: process.env.AXIS_SFTP_KEY_PATH
      ? fs.readFileSync(process.env.AXIS_SFTP_KEY_PATH)
      : null,
    uploadPath: '/upload',
    responsePath: '/download',
    retryAttempts: 3,
    retryDelayMs: 5000
  }
};
```

### Core Upload Function

```javascript
const Client = require('ssh2-sftp-client');

/**
 * Upload generated payout files to bank SFTP servers
 *
 * @returns {Object} { filesUploaded, filesFailed, errors }
 */
async function uploadPayoutFiles() {
  const pool = getDbPool();

  // Fetch files ready for upload
  const filesToUpload = await pool.query(`
    SELECT
      pf.id,
      pf.file_name,
      pf.file_path,
      pf.file_type,
      pf.file_reference,
      pf.transaction_count,
      pf.total_amount_paise
    FROM sp_v2_payout_files pf
    WHERE pf.status = 'GENERATED'
      AND pf.upload_attempted_at IS NULL
      OR (
        pf.status = 'UPLOAD_FAILED'
        AND pf.retry_count < 3
        AND pf.next_retry_at <= NOW()
      )
    ORDER BY pf.created_at ASC
    LIMIT 50
  `);

  if (filesToUpload.rows.length === 0) {
    return { filesUploaded: 0, filesFailed: 0, errors: [] };
  }

  const results = {
    filesUploaded: 0,
    filesFailed: 0,
    errors: []
  };

  for (const file of filesToUpload.rows) {
    try {
      // Mark upload attempt
      await pool.query(`
        UPDATE sp_v2_payout_files
        SET upload_attempted_at = NOW(), retry_count = retry_count + 1
        WHERE id = $1
      `, [file.id]);

      // Determine bank from config (for now, using primary bank HDFC)
      const bankCode = 'HDFC'; // TODO: Get from merchant config
      const config = BANK_SFTP_CONFIGS[bankCode];

      if (!config) {
        throw new Error(`No SFTP config found for bank: ${bankCode}`);
      }

      // Upload file with retry logic
      await uploadFileWithRetry(file, config);

      // Mark as uploaded
      await pool.query(`
        UPDATE sp_v2_payout_files
        SET
          status = 'UPLOADED',
          uploaded_at = NOW(),
          upload_bank = $1
        WHERE id = $2
      `, [bankCode, file.id]);

      // Update bank transfers status
      await pool.query(`
        UPDATE sp_v2_settlement_bank_transfers
        SET status = 'FILE_UPLOADED', updated_at = NOW()
        WHERE file_id = $1
      `, [file.id]);

      results.filesUploaded++;

      console.log(`[SFTP Upload] Successfully uploaded ${file.file_name} to ${bankCode} (${file.transaction_count} transactions, ₹${(file.total_amount_paise / 100).toFixed(2)})`);

    } catch (error) {
      results.filesFailed++;
      results.errors.push({
        fileId: file.id,
        fileName: file.file_name,
        error: error.message
      });

      // Mark as failed
      await pool.query(`
        UPDATE sp_v2_payout_files
        SET
          status = 'UPLOAD_FAILED',
          error_message = $1,
          next_retry_at = NOW() + INTERVAL '30 minutes'
        WHERE id = $2
      `, [error.message, file.id]);

      console.error(`[SFTP Upload] Failed to upload ${file.file_name}:`, error.message);
    }
  }

  return results;
}

/**
 * Upload file with retry logic
 */
async function uploadFileWithRetry(file, config) {
  const sftp = new Client();
  let lastError;

  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      // Connect to SFTP
      await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        readyTimeout: 20000,
        retries: 2
      });

      // Determine upload path based on file type
      let remotePath;
      if (file.file_type === 'NEFT') {
        remotePath = config.uploadPath || '/upload/neft';
      } else if (file.file_type === 'RTGS') {
        remotePath = config.rtgsPath || '/upload/rtgs';
      } else if (file.file_type === 'IMPS') {
        remotePath = config.impsPath || '/upload/imps';
      } else {
        throw new Error(`Unknown file type: ${file.file_type}`);
      }

      // Ensure remote directory exists
      const dirExists = await sftp.exists(remotePath);
      if (!dirExists) {
        throw new Error(`Remote directory does not exist: ${remotePath}`);
      }

      // Upload file
      const remoteFilePath = `${remotePath}/${file.file_name}`;
      await sftp.put(file.file_path, remoteFilePath);

      // Verify upload (check file size)
      const remoteFileInfo = await sftp.stat(remoteFilePath);
      const localFileInfo = await fs.stat(file.file_path);

      if (remoteFileInfo.size !== localFileInfo.size) {
        throw new Error(`File size mismatch: local=${localFileInfo.size}, remote=${remoteFileInfo.size}`);
      }

      console.log(`[SFTP Upload] Uploaded ${file.file_name} to ${config.host}:${remoteFilePath} (attempt ${attempt})`);

      await sftp.end();
      return; // Success

    } catch (error) {
      lastError = error;
      console.error(`[SFTP Upload] Attempt ${attempt}/${config.retryAttempts} failed for ${file.file_name}:`, error.message);

      try {
        await sftp.end();
      } catch (endError) {
        // Ignore errors when closing connection
      }

      if (attempt < config.retryAttempts) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
      }
    }
  }

  // All retries failed
  throw new Error(`Failed after ${config.retryAttempts} attempts: ${lastError.message}`);
}
```

---

## Payout Processor Service

### Main Service Entry Point

**Location:** `services/payout-processor/index.cjs`

```javascript
const cron = require('node-cron');
const { generatePayoutFiles } = require('./file-generator.cjs');
const { uploadPayoutFiles } = require('./sftp-uploader.cjs');
const { pollBankResponses } = require('./status-poller.cjs');
const { retryFailedPayouts } = require('./retry-handler.cjs');

/**
 * Payout Processor Service
 *
 * Schedules:
 * - File generation: Every 30 minutes
 * - File upload: 5 minutes after generation
 * - Status polling: Every 15 minutes
 * - Retry handler: Every 1 hour
 */

console.log('[Payout Processor] Starting service...');

// Schedule file generation (every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Running file generation...');
  try {
    const result = await generatePayoutFiles();
    console.log(`[Cron] File generation completed: ${result.filesGenerated} files, ${result.totalTransfers} transfers`);

    if (result.errors.length > 0) {
      console.error(`[Cron] File generation errors:`, result.errors);
    }

    // Trigger upload immediately if files generated
    if (result.filesGenerated > 0) {
      setTimeout(async () => {
        console.log('[Cron] Triggering SFTP upload...');
        const uploadResult = await uploadPayoutFiles();
        console.log(`[Cron] Upload completed: ${uploadResult.filesUploaded} uploaded, ${uploadResult.filesFailed} failed`);
      }, 5 * 60 * 1000); // 5 minutes delay
    }
  } catch (error) {
    console.error('[Cron] File generation error:', error);
  }
});

// Schedule file upload (every 35 minutes, offset from generation)
cron.schedule('5,35 * * * *', async () => {
  console.log('[Cron] Running SFTP upload...');
  try {
    const result = await uploadPayoutFiles();
    console.log(`[Cron] Upload completed: ${result.filesUploaded} uploaded, ${result.filesFailed} failed`);

    if (result.errors.length > 0) {
      console.error(`[Cron] Upload errors:`, result.errors);
    }
  } catch (error) {
    console.error('[Cron] Upload error:', error);
  }
});

// Schedule status polling (every 15 minutes)
cron.schedule('*/15 * * * *', async () => {
  console.log('[Cron] Running status polling...');
  try {
    const result = await pollBankResponses();
    console.log(`[Cron] Status polling completed: ${result.responsesProcessed} responses, ${result.successCount} success, ${result.failureCount} failed`);
  } catch (error) {
    console.error('[Cron] Status polling error:', error);
  }
});

// Schedule retry handler (every 1 hour)
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running retry handler...');
  try {
    const result = await retryFailedPayouts();
    console.log(`[Cron] Retry handler completed: ${result.retriedCount} retried`);
  } catch (error) {
    console.error('[Cron] Retry handler error:', error);
  }
});

// API endpoints for manual triggers
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/payout/generate', async (req, res) => {
  try {
    const result = await generatePayoutFiles();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payout/upload', async (req, res) => {
  try {
    const result = await uploadPayoutFiles();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payout/poll', async (req, res) => {
  try {
    const result = await pollBankResponses();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/payout/status', async (req, res) => {
  try {
    const pool = getDbPool();

    const stats = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(total_amount_paise) as total_amount_paise
      FROM sp_v2_payout_files
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `);

    res.json({ success: true, stats: stats.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PAYOUT_PROCESSOR_PORT || 5110;
app.listen(PORT, () => {
  console.log(`[Payout Processor] API listening on port ${PORT}`);
  console.log(`[Payout Processor] Cron jobs scheduled`);
});
```

---

## Error Handling & Retry Logic

### Service: Retry Handler

**Location:** `services/payout-processor/retry-handler.cjs`

```javascript
/**
 * Handle retry logic for failed payouts
 *
 * Retry rules:
 * - VALIDATION_FAILED: Retry after 1 hour (e.g., RTGS outside hours)
 * - UPLOAD_FAILED: Retry after 30 minutes (max 3 attempts)
 * - BANK_REJECTED: Manual intervention required (notify ops)
 * - INSUFFICIENT_BALANCE: Retry after 2 hours (alert finance)
 */

async function retryFailedPayouts() {
  const pool = getDbPool();

  const results = {
    retriedCount: 0,
    errors: []
  };

  // 1. Retry validation failures (e.g., RTGS outside hours)
  const validationRetries = await pool.query(`
    SELECT bt.id, bt.transfer_mode, bt.amount_paise
    FROM sp_v2_settlement_bank_transfers bt
    WHERE bt.status = 'VALIDATION_FAILED'
      AND bt.retry_count < 5
      AND bt.next_retry_at <= NOW()
    LIMIT 100
  `);

  for (const transfer of validationRetries.rows) {
    try {
      // Check if validation would pass now
      if (transfer.transfer_mode === 'RTGS' && !isRTGSHours()) {
        // Still outside RTGS hours, reschedule
        await pool.query(`
          UPDATE sp_v2_settlement_bank_transfers
          SET next_retry_at = NOW() + INTERVAL '1 hour'
          WHERE id = $1
        `, [transfer.id]);
        continue;
      }

      // Reset to PENDING for file generation
      await pool.query(`
        UPDATE sp_v2_settlement_bank_transfers
        SET
          status = 'PENDING',
          error_message = NULL,
          retry_count = retry_count + 1,
          file_id = NULL
        WHERE id = $1
      `, [transfer.id]);

      results.retriedCount++;

    } catch (error) {
      results.errors.push({
        transferId: transfer.id,
        error: error.message
      });
    }
  }

  // 2. Retry upload failures
  const uploadRetries = await pool.query(`
    SELECT id, file_name
    FROM sp_v2_payout_files
    WHERE status = 'UPLOAD_FAILED'
      AND retry_count < 3
      AND next_retry_at <= NOW()
    LIMIT 50
  `);

  for (const file of uploadRetries.rows) {
    try {
      // Reset for upload retry
      await pool.query(`
        UPDATE sp_v2_payout_files
        SET status = 'GENERATED', error_message = NULL
        WHERE id = $1
      `, [file.id]);

      results.retriedCount++;

    } catch (error) {
      results.errors.push({
        fileId: file.id,
        error: error.message
      });
    }
  }

  // 3. Alert on bank rejections
  const bankRejections = await pool.query(`
    SELECT
      bt.id,
      bt.merchant_id,
      bt.amount_paise,
      bt.error_message,
      sb.batch_reference
    FROM sp_v2_settlement_bank_transfers bt
    JOIN sp_v2_settlement_batches sb ON bt.settlement_batch_id = sb.id
    WHERE bt.status = 'BANK_REJECTED'
      AND bt.ops_notified_at IS NULL
  `);

  if (bankRejections.rows.length > 0) {
    // Send alert to ops team
    await sendOpsAlert({
      type: 'BANK_REJECTIONS',
      count: bankRejections.rows.length,
      rejections: bankRejections.rows
    });

    // Mark as notified
    const rejectionIds = bankRejections.rows.map(r => r.id);
    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET ops_notified_at = NOW()
      WHERE id = ANY($1)
    `, [rejectionIds]);
  }

  // 4. Alert on insufficient balance
  const insufficientBalance = await pool.query(`
    SELECT
      COUNT(*) as count,
      SUM(amount_paise) as total_paise
    FROM sp_v2_settlement_bank_transfers
    WHERE status = 'INSUFFICIENT_BALANCE'
      AND finance_notified_at IS NULL
  `);

  if (insufficientBalance.rows[0].count > 0) {
    await sendFinanceAlert({
      type: 'INSUFFICIENT_BALANCE',
      count: insufficientBalance.rows[0].count,
      totalAmount: insufficientBalance.rows[0].total_paise / 100
    });

    await pool.query(`
      UPDATE sp_v2_settlement_bank_transfers
      SET finance_notified_at = NOW()
      WHERE status = 'INSUFFICIENT_BALANCE'
        AND finance_notified_at IS NULL
    `);
  }

  return results;
}

/**
 * Send alert to ops team
 */
async function sendOpsAlert(alert) {
  // TODO: Integrate with notification system (Slack, email, etc.)
  console.error('[Retry Handler] OPS ALERT:', JSON.stringify(alert, null, 2));

  // Log to database
  const pool = getDbPool();
  await pool.query(`
    INSERT INTO sp_v2_payout_alerts (
      id, alert_type, alert_data, severity, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, 'HIGH', NOW()
    )
  `, [alert.type, JSON.stringify(alert)]);
}

/**
 * Send alert to finance team
 */
async function sendFinanceAlert(alert) {
  console.error('[Retry Handler] FINANCE ALERT:', JSON.stringify(alert, null, 2));

  const pool = getDbPool();
  await pool.query(`
    INSERT INTO sp_v2_payout_alerts (
      id, alert_type, alert_data, severity, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, 'CRITICAL', NOW()
    )
  `, [alert.type, JSON.stringify(alert)]);
}

module.exports = { retryFailedPayouts };
```

---

## Database Schema

### New Tables for Payout Automation

```sql
-- Migration 031: Payout automation tables

-- Payout files (NEFT/RTGS/IMPS files generated)
CREATE TABLE IF NOT EXISTS sp_v2_payout_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,  -- 'NEFT', 'RTGS', 'IMPS'
  file_reference VARCHAR(50) NOT NULL UNIQUE,
  transaction_count INTEGER NOT NULL,
  total_amount_paise BIGINT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'GENERATED',
    -- 'GENERATED', 'UPLOADED', 'UPLOAD_FAILED',
    -- 'PROCESSING', 'COMPLETED', 'BANK_REJECTED'
  upload_bank VARCHAR(50),  -- 'HDFC', 'ICICI', 'AXIS'
  created_at TIMESTAMP DEFAULT NOW(),
  upload_attempted_at TIMESTAMP,
  uploaded_at TIMESTAMP,
  processed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP,
  bank_response_file VARCHAR(255),
  bank_response_data JSONB
);

CREATE INDEX idx_payout_files_status ON sp_v2_payout_files(status, created_at);
CREATE INDEX idx_payout_files_retry ON sp_v2_payout_files(status, next_retry_at)
  WHERE status IN ('UPLOAD_FAILED', 'BANK_REJECTED');

-- Add file_id to bank_transfers table
ALTER TABLE sp_v2_settlement_bank_transfers
ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES sp_v2_payout_files(id),
ADD COLUMN IF NOT EXISTS ops_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS finance_notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX idx_bank_transfers_file ON sp_v2_settlement_bank_transfers(file_id);
CREATE INDEX idx_bank_transfers_retry ON sp_v2_settlement_bank_transfers(status, next_retry_at)
  WHERE status IN ('VALIDATION_FAILED', 'BANK_REJECTED');

-- Payout alerts (for ops/finance notifications)
CREATE TABLE IF NOT EXISTS sp_v2_payout_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(50) NOT NULL,  -- 'BANK_REJECTIONS', 'INSUFFICIENT_BALANCE', etc.
  alert_data JSONB NOT NULL,
  severity VARCHAR(20) NOT NULL,  -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payout_alerts_unack ON sp_v2_payout_alerts(severity, created_at)
  WHERE acknowledged_at IS NULL;

-- Payout processing log (audit trail)
CREATE TABLE IF NOT EXISTS sp_v2_payout_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES sp_v2_payout_files(id),
  event_type VARCHAR(50) NOT NULL,  -- 'FILE_GENERATED', 'UPLOAD_STARTED', 'UPLOAD_SUCCESS', etc.
  event_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payout_log_file ON sp_v2_payout_processing_log(file_id, created_at);
CREATE INDEX idx_payout_log_event ON sp_v2_payout_processing_log(event_type, created_at);
```

### Status Flow Diagram

```
sp_v2_settlement_bank_transfers.status:

PENDING
  ↓ (file generation)
FILE_GENERATED (file_id set)
  ↓ (SFTP upload)
FILE_UPLOADED
  ↓ (bank processing)
PROCESSING
  ↓ (bank response received)
COMPLETED  ✅
  OR
BANK_REJECTED  ❌
  OR
INSUFFICIENT_BALANCE  ⚠️


sp_v2_payout_files.status:

GENERATED
  ↓ (SFTP upload)
UPLOADED
  ↓ (bank response)
PROCESSING
  ↓
COMPLETED  ✅
  OR
BANK_REJECTED  ❌
  OR
UPLOAD_FAILED  ⚠️ (retry queue)
```

---

## Implementation Timeline

### Week 2-3 Breakdown

#### **Day 6-7: File Generator (NEFT/RTGS)**
- [ ] Create `services/payout-processor/` directory
- [ ] Implement `file-generator.cjs` with NEFT/RTGS support
- [ ] Add helper functions (buildNEFTHeader, buildNEFTTransaction, etc.)
- [ ] Create migration 031 (payout_files table)
- [ ] Write test script `test-file-generation.cjs`
- [ ] Test with sample pending transfers

**Success Criteria:**
- Generate valid 135-character NEFT/RTGS files
- Correctly handle batching (100 txns/file)
- Link transfers to files via file_id
- Files written to `/tmp/payout_files/`

#### **Day 8: File Generator (IMPS XML)**
- [ ] Add IMPS XML generator to `file-generator.cjs`
- [ ] Implement ISO 20022 pain.001.001.03 format
- [ ] Add XML validation logic
- [ ] Test IMPS generation with instant settlements

**Success Criteria:**
- Generate valid ISO 20022 XML files
- Correctly handle IMPS constraints (₹2L max)
- Proper XML escaping for merchant names

#### **Day 9-10: SFTP Integration**
- [ ] Install `ssh2-sftp-client` package
- [ ] Implement `sftp-uploader.cjs`
- [ ] Add bank SFTP configurations
- [ ] Implement retry logic with exponential backoff
- [ ] Add file size verification after upload
- [ ] Configure test SFTP server (or use staging bank server)

**Success Criteria:**
- Successfully upload NEFT/RTGS/IMPS files
- Retry logic works (3 attempts with 5s delay)
- Files marked as UPLOADED in database
- Error handling for connection failures

#### **Day 11: Status Poller**
- [ ] Implement `status-poller.cjs`
- [ ] Add bank response file parsing (NEFT/RTGS response format)
- [ ] Update transfer status based on bank response
- [ ] Handle partial success (some txns failed in batch)

**Success Criteria:**
- Download response files from bank SFTP
- Parse fixed-width response format
- Update sp_v2_settlement_bank_transfers.status
- Mark settlement batches as PAID when all transfers complete

#### **Day 12: Retry Handler & Alerts**
- [ ] Implement `retry-handler.cjs`
- [ ] Add retry logic for VALIDATION_FAILED (RTGS hours)
- [ ] Add retry logic for UPLOAD_FAILED
- [ ] Implement ops alert system (email/Slack)
- [ ] Implement finance alert system (insufficient balance)
- [ ] Create payout_alerts table

**Success Criteria:**
- Automatic retry of RTGS transfers during banking hours
- Ops team alerted on bank rejections
- Finance team alerted on insufficient balance
- All alerts logged to database

#### **Day 13-14: Main Service & Cron**
- [ ] Implement `index.cjs` (main service entry point)
- [ ] Add cron schedules (every 30 min generation, every 15 min polling)
- [ ] Add manual trigger API endpoints
- [ ] Add status dashboard endpoint
- [ ] Create PM2 ecosystem config
- [ ] Write comprehensive test suite

**Success Criteria:**
- Service runs as PM2 process
- Cron jobs execute on schedule
- Manual triggers work via API
- Status endpoint returns file stats

#### **Day 15: End-to-End Testing**
- [ ] Test complete flow: approval → file → upload → bank response
- [ ] Test error scenarios (SFTP down, bank rejection, etc.)
- [ ] Test retry logic (RTGS hours, upload failures)
- [ ] Load test (100 settlements, 1000 transfers)
- [ ] Security audit (SFTP credentials, file permissions)

**Success Criteria:**
- E2E flow completes without manual intervention
- All error scenarios handled gracefully
- Retry logic works as expected
- Load test passes (100 settlements in <5 min)
- No credentials in code (all in .env)

---

## Testing Strategy

### Unit Tests

**Location:** `services/payout-processor/__tests__/`

#### Test File Format Generation

```javascript
// __tests__/file-generator.test.js

const { buildNEFTHeader, buildNEFTTransaction } = require('../file-generator.cjs');

describe('NEFT File Format', () => {
  test('Header record is exactly 135 characters', () => {
    const header = buildNEFTHeader('2025102201', new Date('2025-10-22T14:30:00'));
    expect(header.length).toBe(137); // 135 + \r\n
    expect(header.slice(0, 1)).toBe('H');
  });

  test('Transaction record has correct amount padding', () => {
    const transfer = {
      bank_account_number: '12345678901234',
      bank_account_name: 'TEST MERCHANT',
      bank_ifsc_code: 'HDFC0001234',
      amount_paise: 100000000, // ₹10,00,000
      batch_reference: 'B202510221'
    };

    const txnRecord = buildNEFTTransaction(transfer, new Date('2025-10-22'));
    expect(txnRecord).toContain('0000100000000'); // Amount with leading zeros
    expect(txnRecord.length).toBe(137); // 135 + \r\n
  });
});
```

#### Test SFTP Upload

```javascript
// __tests__/sftp-uploader.test.js

const { uploadFileWithRetry } = require('../sftp-uploader.cjs');

describe('SFTP Upload', () => {
  test('Retry 3 times on connection failure', async () => {
    const mockConfig = {
      host: 'invalid-host.example.com',
      port: 22,
      username: 'test',
      password: 'test',
      retryAttempts: 3,
      retryDelayMs: 100
    };

    const mockFile = {
      id: 'test-file-id',
      file_name: 'TEST_FILE.txt',
      file_path: '/tmp/test.txt',
      file_type: 'NEFT'
    };

    await expect(uploadFileWithRetry(mockFile, mockConfig)).rejects.toThrow('Failed after 3 attempts');
  });
});
```

### Integration Tests

**Location:** `services/payout-processor/__tests__/integration/`

#### End-to-End Payout Test

```javascript
// test-e2e-payout.cjs

const { Pool } = require('pg');
const { generatePayoutFiles } = require('../file-generator.cjs');
const fs = require('fs').promises;

async function testE2EPayoutFlow() {
  const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'settlepaisa_v2',
    password: 'settlepaisa123',
    port: 5432
  });

  console.log('=== E2E Payout Flow Test ===\n');

  // 1. Create test settlement batch
  console.log('1. Creating test settlement batch...');
  const batchResult = await pool.query(`
    INSERT INTO sp_v2_settlement_batches (
      id, merchant_id, cycle_date, status, approved_at,
      total_transactions, total_amount_paise, settlement_type, batch_reference
    ) VALUES (
      gen_random_uuid(), 'MERCH001', '2025-10-22', 'APPROVED', NOW(),
      5, 50000000, 'automatic', 'B20251022TEST'
    ) RETURNING id
  `);
  const batchId = batchResult.rows[0].id;
  console.log(`   Created batch: ${batchId}\n`);

  // 2. Create pending bank transfers
  console.log('2. Creating pending bank transfers...');
  const transfers = [];
  for (let i = 1; i <= 5; i++) {
    const transferResult = await pool.query(`
      INSERT INTO sp_v2_settlement_bank_transfers (
        id, settlement_batch_id, merchant_id, amount_paise,
        transfer_mode, status, initiated_at
      ) VALUES (
        gen_random_uuid(), $1, 'MERCH001', $2, 'NEFT', 'PENDING', NOW()
      ) RETURNING id
    `, [batchId, 10000000 * i]);
    transfers.push(transferResult.rows[0].id);
  }
  console.log(`   Created ${transfers.length} transfers\n`);

  // 3. Generate payout files
  console.log('3. Running file generator...');
  const genResult = await generatePayoutFiles();
  console.log(`   Generated ${genResult.filesGenerated} files`);
  console.log(`   Total transfers: ${genResult.totalTransfers}\n`);

  // 4. Verify file creation
  console.log('4. Verifying file creation...');
  const filesQuery = await pool.query(`
    SELECT file_name, file_path, transaction_count, total_amount_paise
    FROM sp_v2_payout_files
    WHERE status = 'GENERATED'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (filesQuery.rows.length > 0) {
    const file = filesQuery.rows[0];
    console.log(`   File: ${file.file_name}`);
    console.log(`   Transactions: ${file.transaction_count}`);
    console.log(`   Amount: ₹${(file.total_amount_paise / 100).toFixed(2)}\n`);

    // 5. Verify file format
    console.log('5. Verifying file format...');
    const fileContent = await fs.readFile(file.file_path, 'ascii');
    const lines = fileContent.split('\r\n').filter(l => l.length > 0);

    console.log(`   Total lines: ${lines.length}`);
    console.log(`   Header: ${lines[0].substring(0, 20)}...`);
    console.log(`   First transaction: ${lines[2].substring(0, 30)}...`);

    // Check record lengths
    const allCorrectLength = lines.every(line => line.length === 135);
    console.log(`   All records 135 chars: ${allCorrectLength ? '✅' : '❌'}\n`);
  }

  // 6. Verify transfer status
  console.log('6. Verifying transfer status...');
  const statusQuery = await pool.query(`
    SELECT status, COUNT(*)
    FROM sp_v2_settlement_bank_transfers
    WHERE id = ANY($1)
    GROUP BY status
  `, [transfers]);

  console.log('   Status distribution:');
  for (const row of statusQuery.rows) {
    console.log(`     ${row.status}: ${row.count}`);
  }

  console.log('\n=== Test Complete ===');

  // Cleanup
  await pool.query(`DELETE FROM sp_v2_payout_files WHERE id IN (SELECT file_id FROM sp_v2_settlement_bank_transfers WHERE id = ANY($1))`, [transfers]);
  await pool.query(`DELETE FROM sp_v2_settlement_bank_transfers WHERE id = ANY($1)`, [transfers]);
  await pool.query(`DELETE FROM sp_v2_settlement_batches WHERE id = $1`, [batchId]);

  await pool.end();
}

testE2EPayoutFlow().catch(console.error);
```

**Expected Output:**
```
=== E2E Payout Flow Test ===

1. Creating test settlement batch...
   Created batch: 123e4567-e89b-12d3-a456-426614174000

2. Creating pending bank transfers...
   Created 5 transfers

3. Running file generator...
   Generated 1 files
   Total transfers: 5

4. Verifying file creation...
   File: NEFT_SABPAISA01_20251022_001.txt
   Transactions: 5
   Amount: ₹1,50,000.00

5. Verifying file format...
   Total lines: 8
   Header: H00000HDFC0000001SAB...
   First transaction: T0112345678901234  MER...
   All records 135 chars: ✅

6. Verifying transfer status...
   Status distribution:
     FILE_GENERATED: 5

=== Test Complete ===
```

---

## Security & Compliance

### 1. SFTP Credential Management

```bash
# .env file (NEVER commit to git)

# HDFC Bank SFTP
HDFC_SFTP_HOST=sftp.hdfcbank.com
HDFC_SFTP_PORT=22
HDFC_SFTP_USER=sabpaisa_prod
HDFC_SFTP_PASSWORD=<encrypted-password>
HDFC_SFTP_KEY_PATH=/secure/keys/hdfc_rsa_key

# ICICI Bank SFTP
ICICI_SFTP_HOST=sftp.icicibank.com
ICICI_SFTP_PORT=22
ICICI_SFTP_USER=sabpaisa_prod
ICICI_SFTP_PASSWORD=<encrypted-password>
ICICI_SFTP_KEY_PATH=/secure/keys/icici_rsa_key
```

### 2. File Encryption

All sensitive payout files should be PGP-encrypted before SFTP upload:

```javascript
const openpgp = require('openpgp');

/**
 * Encrypt file with bank's public PGP key
 */
async function encryptPayoutFile(filePath, bankPublicKey) {
  const fileContent = await fs.readFile(filePath, 'ascii');

  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: fileContent }),
    encryptionKeys: await openpgp.readKey({ armoredKey: bankPublicKey })
  });

  const encryptedPath = `${filePath}.pgp`;
  await fs.writeFile(encryptedPath, encrypted);

  return encryptedPath;
}
```

### 3. Audit Trail

All payout operations must be logged:

```javascript
async function logPayoutEvent(fileId, eventType, eventData) {
  const pool = getDbPool();

  await pool.query(`
    INSERT INTO sp_v2_payout_processing_log (
      id, file_id, event_type, event_data, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, NOW()
    )
  `, [fileId, eventType, JSON.stringify(eventData)]);
}

// Usage:
await logPayoutEvent(fileId, 'FILE_GENERATED', { fileName, txnCount, totalAmount });
await logPayoutEvent(fileId, 'UPLOAD_STARTED', { bank, remotePath });
await logPayoutEvent(fileId, 'UPLOAD_SUCCESS', { fileSize, duration });
```

### 4. Compliance Checks

Before file generation, verify compliance:

```javascript
async function validatePayoutCompliance(transfers) {
  const errors = [];

  for (const transfer of transfers) {
    // 1. Check beneficiary is not in sanctions list
    const isSanctioned = await checkSanctionsList(transfer.bank_account_number);
    if (isSanctioned) {
      errors.push({
        transferId: transfer.id,
        reason: 'Beneficiary in sanctions list',
        severity: 'CRITICAL'
      });
    }

    // 2. Check daily payout limits
    const dailyTotal = await getDailyPayoutTotal(transfer.merchant_id);
    const merchantLimit = await getMerchantPayoutLimit(transfer.merchant_id);

    if (dailyTotal + transfer.amount_paise > merchantLimit) {
      errors.push({
        transferId: transfer.id,
        reason: 'Exceeds daily payout limit',
        severity: 'HIGH'
      });
    }

    // 3. Check bank account verified
    const isVerified = await isBankAccountVerified(transfer.merchant_id);
    if (!isVerified) {
      errors.push({
        transferId: transfer.id,
        reason: 'Bank account not verified (penny drop)',
        severity: 'CRITICAL'
      });
    }
  }

  return errors;
}
```

---

## Monitoring & Alerting

### Key Metrics to Track

```javascript
// Dashboard metrics endpoint
app.get('/api/payout/metrics', async (req, res) => {
  const pool = getDbPool();

  // 1. Files generated today
  const filesGenerated = await pool.query(`
    SELECT COUNT(*), SUM(transaction_count), SUM(total_amount_paise)
    FROM sp_v2_payout_files
    WHERE DATE(created_at) = CURRENT_DATE
  `);

  // 2. Upload success rate (last 24 hours)
  const uploadStats = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM sp_v2_payout_files
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY status
  `);

  // 3. Average processing time
  const avgProcessingTime = await pool.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_seconds
    FROM sp_v2_payout_files
    WHERE status = 'COMPLETED'
      AND created_at > NOW() - INTERVAL '7 days'
  `);

  // 4. Pending transfers
  const pendingTransfers = await pool.query(`
    SELECT
      transfer_mode,
      COUNT(*) as count,
      SUM(amount_paise) as total_paise
    FROM sp_v2_settlement_bank_transfers
    WHERE status IN ('PENDING', 'FILE_GENERATED', 'FILE_UPLOADED')
    GROUP BY transfer_mode
  `);

  // 5. Failed transfers requiring attention
  const failedTransfers = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM sp_v2_settlement_bank_transfers
    WHERE status IN ('BANK_REJECTED', 'INSUFFICIENT_BALANCE', 'VALIDATION_FAILED')
      AND retry_count >= 3
  `);

  res.json({
    success: true,
    metrics: {
      today: filesGenerated.rows[0],
      uploadStats: uploadStats.rows,
      avgProcessingTime: avgProcessingTime.rows[0].avg_seconds,
      pending: pendingTransfers.rows,
      failed: failedTransfers.rows
    }
  });
});
```

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Upload failure rate > 10% (last hour) | HIGH | Alert ops team, check SFTP connectivity |
| Pending transfers > 500 | MEDIUM | Alert ops team, may need manual batch |
| Any transfer with retry_count >= 3 | HIGH | Alert ops team for manual review |
| Insufficient balance alert | CRITICAL | Alert finance team immediately |
| Bank rejection rate > 5% | HIGH | Alert ops team, investigate bank account issues |
| Processing time > 2 hours (instant settlements) | CRITICAL | Alert ops team, SLA breach |

---

## Summary

This payout automation system provides:

1. **File Generation**: NEFT/RTGS/IMPS files in correct bank formats
2. **SFTP Integration**: Automated upload to bank servers with retry logic
3. **Status Tracking**: Poll bank responses, update transfer status
4. **Error Handling**: Retry logic, alerts, manual intervention triggers
5. **Compliance**: Audit trail, PGP encryption, sanctions list checks
6. **Monitoring**: Real-time metrics, SLA tracking, alerting

**Post Phase 2 State:**
- Approved settlements → Auto-generate files → Auto-upload → Auto-process responses → Mark as PAID
- Zero manual intervention for successful flows
- Alerts for exceptions requiring human review
- Complete audit trail for compliance

**Dependencies:**
- Phase 1 must be complete (settlement calculation with chargeback/refund deduction)
- SFTP credentials from banks
- Test SFTP server for staging

**Estimated Effort:** 10 days (2 weeks)

---

**Document Created By:** Claude Code
**Date:** October 22, 2025
**Status:** Ready for Implementation
