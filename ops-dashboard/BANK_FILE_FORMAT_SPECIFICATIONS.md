# Bank File Format Specifications
## Complete Reference for NEFT, RTGS, and IMPS Files

**Created:** October 22, 2025
**Version:** 1.0
**Purpose:** Detailed specifications for generating bank payment files
**Audience:** Developers, QA, Operations

---

## Table of Contents

1. [NEFT File Format](#neft-file-format)
2. [RTGS File Format](#rtgs-file-format)
3. [IMPS XML Format](#imps-xml-format)
4. [Validation Rules](#validation-rules)
5. [Error Codes](#error-codes)
6. [Sample Files](#sample-files)
7. [Testing Checklist](#testing-checklist)

---

## NEFT File Format

### Overview

**Standard:** SFMS (Structured Financial Messaging System)
**Format:** Fixed-width ASCII text file
**Extension:** `.txt`
**Line Ending:** CRLF (`\r\n`)
**Character Encoding:** ASCII
**Record Length:** 135 characters (excluding CRLF)

### File Structure

```
[Header Record (H)]          ← 1 record
[Batch Header (BH)]          ← 1 record
[Transaction Record (T)]     ← N records (1 to 100)
[Transaction Record (T)]
...
[Batch Trailer (BT)]         ← 1 record
[File Trailer (FT)]          ← 1 record
```

### Record Specifications

#### 1. Header Record (H)

**Purpose:** Identifies the file and routing information
**Length:** 135 characters

| Position | Length | Field Name | Data Type | Format | Example | Mandatory | Description |
|----------|--------|------------|-----------|--------|---------|-----------|-------------|
| 1 | 1 | Record Type | CHAR | Fixed | H | Yes | Always 'H' |
| 2-6 | 5 | Priority Code | NUMERIC | Padded | 00000 | Yes | Always '00000' for normal priority |
| 7-16 | 10 | Destination Bank Code | CHAR | Left-aligned | HDFC0000001 | Yes | IFSC of destination bank (padded with spaces) |
| 17-26 | 10 | Originator Code | CHAR | Left-aligned | SABP000001 | Yes | Client code assigned by bank |
| 27-36 | 10 | File Reference | CHAR | Left-aligned | 2025102201 | Yes | Unique file reference number |
| 37-44 | 8 | File Date | DATE | YYYYMMDD | 20251022 | Yes | Date of file creation |
| 45-48 | 4 | File Time | TIME | HHMM | 1430 | Yes | Time of file creation (24-hour format) |
| 49-135 | 87 | Filler | CHAR | Spaces | (spaces) | No | Reserved for future use |

**JavaScript Implementation:**

```javascript
function buildNEFTHeader(fileReference, fileDate) {
  const recordType = 'H';
  const priorityCode = '00000';
  const destinationBank = 'HDFC0000001'; // From config
  const originatorCode = 'SABP000001'.padEnd(10, ' ');
  const fileRef = fileReference.substring(0, 10).padEnd(10, ' ');
  const fileDateStr = fileDate.toISOString().slice(0, 10).replace(/-/g, '');
  const fileTimeStr = fileDate.toTimeString().slice(0, 5).replace(/:/g, '');
  const filler = ''.padEnd(87, ' ');

  const record = recordType + priorityCode + destinationBank + originatorCode +
                 fileRef + fileDateStr + fileTimeStr + filler;

  // Validation
  if (record.length !== 135) {
    throw new Error(`Invalid header length: ${record.length}, expected 135`);
  }

  return record + '\r\n';
}
```

**Example:**
```
H00000HDFC0000001SABP000001202510220120251022 1430
|←1→|←-5→|←---10--→|←---10--→|←---10--→|←--8-→|4→|←---------------------------------87---------------------------------→|
```

---

#### 2. Batch Header (BH)

**Purpose:** Identifies the batch within the file
**Length:** 135 characters

| Position | Length | Field Name | Data Type | Format | Example | Mandatory | Description |
|----------|--------|------------|-----------|--------|---------|-----------|-------------|
| 1-2 | 2 | Record Type | CHAR | Fixed | BH | Yes | Always 'BH' |
| 3-12 | 10 | Client Code | CHAR | Left-aligned | SABPAISA01 | Yes | Client identifier |
| 13-42 | 30 | Client Name | CHAR | Left-aligned | SABPAISA MERCHANT SERVICES PV | Yes | Client's registered name (padded) |
| 43-52 | 10 | Product Code | CHAR | Left-aligned | NEFT | Yes | Always 'NEFT' for NEFT files |
| 53-62 | 10 | Batch Reference | CHAR | Left-aligned | B202510221 | Yes | Unique batch identifier |
| 63-70 | 8 | Value Date | DATE | YYYYMMDD | 20251022 | Yes | Settlement date |
| 71-135 | 65 | Filler | CHAR | Spaces | (spaces) | No | Reserved |

**JavaScript Implementation:**

```javascript
function buildNEFTBatchHeader(batchReference, valueDate) {
  const recordType = 'BH';
  const clientCode = 'SABPAISA01'.padEnd(10, ' ');
  const clientName = 'SABPAISA MERCHANT SERVICES PV'.substring(0, 30).padEnd(30, ' ');
  const productCode = 'NEFT      '; // 10 chars
  const batchRef = batchReference.substring(0, 10).padEnd(10, ' ');
  const valueDateStr = valueDate.toISOString().slice(0, 10).replace(/-/g, '');
  const filler = ''.padEnd(65, ' ');

  const record = recordType + clientCode + clientName + productCode +
                 batchRef + valueDateStr + filler;

  if (record.length !== 135) {
    throw new Error(`Invalid batch header length: ${record.length}`);
  }

  return record + '\r\n';
}
```

**Example:**
```
BHSABPAISA01SABPAISA MERCHANT SERVICES PVNEFT      B20251022120251022
|2|←--10-→|←-----------30-----------→|←---10--→|←---10--→|←--8-→|←---------65--------→|
```

---

#### 3. Transaction Record (T)

**Purpose:** Contains individual payment transaction details
**Length:** 135 characters
**Max per file:** 100 transactions

| Position | Length | Field Name | Data Type | Format | Example | Mandatory | Description |
|----------|--------|------------|-----------|--------|---------|-----------|-------------|
| 1 | 1 | Record Type | CHAR | Fixed | T | Yes | Always 'T' |
| 2-3 | 2 | Transaction Type | NUMERIC | Fixed | 01 | Yes | 01=Credit, 02=Debit (always 01) |
| 4-19 | 16 | Beneficiary Account | CHAR | Left-aligned | 12345678901234 | Yes | Bank account number (padded) |
| 20-54 | 35 | Beneficiary Name | CHAR | Left-aligned | MERCHANT ABC PRIVATE LIMITED | Yes | Account holder name (uppercase) |
| 55-64 | 10 | Beneficiary IFSC | CHAR | Fixed | HDFC0001234 | Yes | Beneficiary bank IFSC code |
| 65-77 | 13 | Amount | NUMERIC | Paise, zero-padded | 0000100000000 | Yes | Amount in paise (₹10,00,000 = 0000100000000) |
| 78-107 | 30 | Sender to Receiver Info | CHAR | Left-aligned | Settlement for Oct 21 | No | Payment remarks/narration |
| 108-117 | 10 | Client Reference | CHAR | Left-aligned | S202510210 | Yes | Unique transaction reference |
| 118-125 | 8 | Transaction Date | DATE | YYYYMMDD | 20251022 | Yes | Transaction processing date |
| 126-135 | 10 | Filler | CHAR | Spaces | (spaces) | No | Reserved |

**JavaScript Implementation:**

```javascript
function buildNEFTTransaction(transfer, txnDate) {
  const recordType = 'T';
  const txnType = '01'; // Credit
  const beneficiaryAccount = transfer.bank_account_number.substring(0, 16).padEnd(16, ' ');
  const beneficiaryName = transfer.bank_account_name.substring(0, 35).toUpperCase().padEnd(35, ' ');
  const beneficiaryIFSC = transfer.bank_ifsc_code.substring(0, 10).padEnd(10, ' ');
  const amountPaise = String(transfer.amount_paise).padStart(13, '0');
  const remarks = `Settlement ${transfer.batch_reference}`.substring(0, 30).padEnd(30, ' ');
  const clientRef = transfer.batch_reference.substring(0, 10).padEnd(10, ' ');
  const txnDateStr = txnDate.toISOString().slice(0, 10).replace(/-/g, '');
  const filler = ''.padEnd(10, ' ');

  const record = recordType + txnType + beneficiaryAccount + beneficiaryName +
                 beneficiaryIFSC + amountPaise + remarks + clientRef + txnDateStr + filler;

  if (record.length !== 135) {
    throw new Error(`Invalid transaction length: ${record.length}`);
  }

  return record + '\r\n';
}
```

**Example:**
```
T0112345678901234  MERCHANT ABC PRIVATE LIMITED   HDFC00012340000100000000Settlement for Oct 21        S20251021020251022
|1|2|←-----16----→|←-----------35-----------→|←---10--→|←----13---→|←---------30--------→|←---10--→|←--8-→|←-10→|
```

**Amount Encoding Examples:**

| Amount (₹) | Amount in Paise | Field Value (13 digits) |
|------------|-----------------|-------------------------|
| ₹1.00 | 100 | 0000000000100 |
| ₹100.00 | 10,000 | 0000000010000 |
| ₹10,000.00 | 10,00,000 | 0000001000000 |
| ₹1,00,000.00 | 1,00,00,000 | 0000100000000 |
| ₹10,00,000.00 | 10,00,00,000 | 0001000000000 |
| ₹99,99,999.99 | 99,99,99,999 | 0009999999999 |

---

#### 4. Batch Trailer (BT)

**Purpose:** Summarizes the batch (transaction count and total amount)
**Length:** 135 characters

| Position | Length | Field Name | Data Type | Format | Example | Mandatory | Description |
|----------|--------|------------|-----------|--------|---------|-----------|-------------|
| 1-2 | 2 | Record Type | CHAR | Fixed | BT | Yes | Always 'BT' |
| 3-12 | 10 | Batch Reference | CHAR | Left-aligned | B202510221 | Yes | Same as batch header |
| 13-20 | 8 | Transaction Count | NUMERIC | Zero-padded | 00000025 | Yes | Number of 'T' records in batch |
| 21-33 | 13 | Batch Total | NUMERIC | Paise, zero-padded | 0002500000000 | Yes | Sum of all transaction amounts |
| 34-135 | 102 | Filler | CHAR | Spaces | (spaces) | No | Reserved |

**JavaScript Implementation:**

```javascript
function buildNEFTBatchTrailer(batchReference, txnCount, totalPaise) {
  const recordType = 'BT';
  const batchRef = batchReference.substring(0, 10).padEnd(10, ' ');
  const txnCountStr = String(txnCount).padStart(8, '0');
  const totalPaiseStr = String(totalPaise).padStart(13, '0');
  const filler = ''.padEnd(102, ' ');

  const record = recordType + batchRef + txnCountStr + totalPaiseStr + filler;

  if (record.length !== 135) {
    throw new Error(`Invalid batch trailer length: ${record.length}`);
  }

  return record + '\r\n';
}
```

**Example:**
```
BT          B20251022100000025000025000000000
|2|←---10--→|←--8-→|←----13---→|←----------------------------------------102---------------------------------------→|
```

---

#### 5. File Trailer (FT)

**Purpose:** Summarizes the entire file (batch count, transaction count, total amount)
**Length:** 135 characters

| Position | Length | Field Name | Data Type | Format | Example | Mandatory | Description |
|----------|--------|------------|-----------|--------|---------|-----------|-------------|
| 1-2 | 2 | Record Type | CHAR | Fixed | FT | Yes | Always 'FT' |
| 3-12 | 10 | File Reference | CHAR | Left-aligned | 2025102201 | Yes | Same as header file reference |
| 13-20 | 8 | Batch Count | NUMERIC | Zero-padded | 00000001 | Yes | Number of batches in file (usually 1) |
| 21-28 | 8 | Total Transactions | NUMERIC | Zero-padded | 00000025 | Yes | Total number of 'T' records |
| 29-41 | 13 | File Total | NUMERIC | Paise, zero-padded | 0002500000000 | Yes | Sum of all amounts in file |
| 42-135 | 94 | Filler | CHAR | Spaces | (spaces) | No | Reserved |

**JavaScript Implementation:**

```javascript
function buildNEFTFileTrailer(fileReference, batchCount, txnCount, totalPaise) {
  const recordType = 'FT';
  const fileRef = fileReference.substring(0, 10).padEnd(10, ' ');
  const batchCountStr = String(batchCount).padStart(8, '0');
  const txnCountStr = String(txnCount).padStart(8, '0');
  const totalPaiseStr = String(totalPaise).padStart(13, '0');
  const filler = ''.padEnd(94, ' ');

  const record = recordType + fileRef + batchCountStr + txnCountStr + totalPaiseStr + filler;

  if (record.length !== 135) {
    throw new Error(`Invalid file trailer length: ${record.length}`);
  }

  return record + '\r\n';
}
```

**Example:**
```
FT          2025102201000000010000002500002500000000
|2|←---10--→|←--8-→|←--8-→|←----13---→|←-----------------------------------94----------------------------------→|
```

---

### Complete NEFT File Example

**Scenario:** 3 settlements to merchants
**Total Amount:** ₹3,50,000.00
**File Date:** 2025-10-22, 14:30

```
H00000HDFC0000001SABP0000012025102201202510221430
BHSABPAISA01SABPAISA MERCHANT SERVICES PVNEFT      B20251022120251022
T0112345678901234  MERCHANT ABC PRIVATE LIMITED   HDFC00012340000100000000Settlement B2025102211    S20251021020251022
T0187654321098765  RETAILER XYZ LLP               ICIC00056780000150000000Settlement B2025102211    S20251021220251022
T0145678901234567  DISTRIBUTOR PQR ENTERPRISES    AXIS00098760000100000000Settlement B2025102211    S20251021520251022
BT          B20251022100000003000035000000000
FT          2025102201000000010000000300003500000000
```

**File Validation:**
- ✅ All records are 135 characters (excluding CRLF)
- ✅ Transaction count matches: 3 'T' records
- ✅ Amount totals match: 10,00,00,000 + 15,00,00,000 + 10,00,00,000 = 35,00,00,000 paise = ₹3,50,000.00
- ✅ Batch reference consistent: B202510221
- ✅ File reference consistent: 2025102201
- ✅ File has exactly 7 lines (H + BH + 3T + BT + FT)

---

## RTGS File Format

### Overview

**Standard:** SFMS (same as NEFT)
**Format:** Fixed-width ASCII text file
**Extension:** `.txt`
**Key Differences from NEFT:**
1. Product code is "RTGS" instead of "NEFT"
2. Minimum amount: ₹2,00,000 (enforced at application level)
3. Time window: Monday-Friday, 9:00 AM - 4:30 PM IST
4. Real-time gross settlement (faster than NEFT)

### Record Structure

**RTGS uses IDENTICAL record formats as NEFT with the following changes:**

#### Batch Header (BH) - Product Code Field

| Position | Length | Field Name | Example (NEFT) | Example (RTGS) |
|----------|--------|------------|----------------|----------------|
| 43-52 | 10 | Product Code | NEFT       | RTGS       |

**Example RTGS Batch Header:**
```
BHSABPAISA01SABPAISA MERCHANT SERVICES PVRTGS      R20251022120251022
                                         ^^^^
                                         Product code changed to RTGS
```

### RTGS-Specific Validation Rules

```javascript
function validateRTGSTransaction(transfer) {
  const errors = [];

  // 1. Minimum amount: ₹2,00,000
  if (transfer.amount_paise < 20000000) {
    errors.push({
      field: 'amount_paise',
      value: transfer.amount_paise,
      message: 'RTGS minimum is ₹2,00,000 (20000000 paise)',
      actualAmount: `₹${(transfer.amount_paise / 100).toFixed(2)}`
    });
  }

  // 2. Banking hours check
  if (!isRTGSHours()) {
    const now = new Date();
    errors.push({
      field: 'scheduled_time',
      message: 'RTGS available Mon-Fri, 9:00 AM - 4:30 PM IST',
      currentTime: now.toISOString(),
      currentDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()]
    });
  }

  return errors;
}

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
```

### RTGS File Example

**Scenario:** 2 large settlements
**Total Amount:** ₹45,00,000.00
**File Date:** 2025-10-22, 10:15 (within RTGS hours)

```
H00000HDFC0000001SABP0000012025102201202510221015
BHSABPAISA01SABPAISA MERCHANT SERVICES PVRTGS      R20251022120251022
T0198765432109876  BIG MERCHANT INDIA LTD         HDFC00045670002000000000Settlement R2025102211    R20251021020251022
T0156789012345678  LARGE RETAILER CHAIN PVT LTD   ICIC00012340002500000000Settlement R2025102211    R20251021520251022
BT          R20251022100000002000045000000000
FT          2025102201000000010000000200004500000000
```

**Key Points:**
- Both transactions ≥ ₹2,00,000 ✅
- File generated at 10:15 (within 9:00-16:30 window) ✅
- Product code is "RTGS      " ✅
- Batch reference starts with 'R' (convention for clarity)

---

## IMPS XML Format

### Overview

**Standard:** ISO 20022 (pain.001.001.03 - Customer Credit Transfer Initiation)
**Format:** XML
**Extension:** `.xml`
**Character Encoding:** UTF-8
**Max Amount:** ₹2,00,000 per transaction
**Availability:** 24x7 (including weekends and holidays)

### XML Schema

**Namespace:** `urn:iso:std:iso:20022:tech:xsd:pain.001.001.03`
**Root Element:** `<Document>`

### Structure

```xml
<Document>
  <CstmrCdtTrfInitn>  <!-- Customer Credit Transfer Initiation -->
    <GrpHdr>           <!-- Group Header -->
    <PmtInf>           <!-- Payment Information -->
      <CdtTrfTxInf>    <!-- Credit Transfer Transaction Info (repeats) -->
      <CdtTrfTxInf>
      ...
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
```

### Element Specifications

#### 1. Group Header (`<GrpHdr>`)

**Purpose:** Identifies the message and initiating party

```xml
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
```

| Element | Type | Format | Example | Mandatory | Description |
|---------|------|--------|---------|-----------|-------------|
| `MsgId` | String | Max 35 chars | SABPAISA_20251022_143000_001 | Yes | Unique message identifier |
| `CreDtTm` | DateTime | ISO 8601 | 2025-10-22T14:30:00 | Yes | Message creation timestamp |
| `NbOfTxs` | Integer | Numeric | 10 | Yes | Total number of transactions |
| `CtrlSum` | Decimal | 2 decimals | 500000.00 | Yes | Total amount in rupees (not paise) |
| `InitgPty/Nm` | String | Max 140 chars | SABPAISA MERCHANT SERVICES | Yes | Initiating party name |
| `InitgPty/Id/OrgId/Othr/Id` | String | Max 35 chars | SABPAISA01 | Yes | Organization identifier |

---

#### 2. Payment Information (`<PmtInf>`)

**Purpose:** Groups transactions with common payment method and execution date

```xml
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

  <!-- Debtor (SabPaisa) account details -->
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

  <!-- Transactions follow... -->
</PmtInf>
```

| Element | Type | Example | Mandatory | Description |
|---------|------|---------|-----------|-------------|
| `PmtInfId` | String | BATCH_20251022_001 | Yes | Payment information ID |
| `PmtMtd` | Code | TRF | Yes | Payment method (TRF = Transfer) |
| `BtchBookg` | Boolean | true | No | Batch booking indicator |
| `NbOfTxs` | Integer | 10 | Yes | Number of transactions in batch |
| `CtrlSum` | Decimal | 500000.00 | Yes | Control sum (total amount) |
| `SvcLvl/Cd` | Code | IMPS | Yes | Service level (IMPS for instant) |
| `ReqdExctnDt` | Date | 2025-10-22 | Yes | Requested execution date |
| `Dbtr/Nm` | String | SABPAISA MERCHANT SERVICES | Yes | Debtor name |
| `DbtrAcct/Id/Othr/Id` | String | 98765432109876 | Yes | Debtor account number |
| `DbtrAgt/FinInstnId/ClrSysMmbId/MmbId` | String | HDFC0000001 | Yes | Debtor bank IFSC |

---

#### 3. Credit Transfer Transaction (`<CdtTrfTxInf>`)

**Purpose:** Individual payment transaction details
**Max per file:** 100 transactions (NPCI limit)

```xml
<CdtTrfTxInf>
  <PmtId>
    <InstrId>TXN_20251022_0001</InstrId>
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
```

| Element | Type | Example | Mandatory | Description |
|---------|------|---------|-----------|-------------|
| `PmtId/InstrId` | String | TXN_20251022_0001 | Yes | Instruction identifier (unique per txn) |
| `PmtId/EndToEndId` | String | S2025102101 | Yes | End-to-end reference (settlement batch ref) |
| `Amt/InstdAmt` | Decimal | 100000.00 | Yes | Instructed amount in rupees (NOT paise) |
| `Amt/InstdAmt/@Ccy` | Code | INR | Yes | Currency code (always INR) |
| `CdtrAgt/FinInstnId/ClrSysMmbId/MmbId` | String | HDFC0001234 | Yes | Creditor bank IFSC |
| `Cdtr/Nm` | String | MERCHANT ABC PRIVATE LIMITED | Yes | Creditor name (beneficiary) |
| `CdtrAcct/Id/Othr/Id` | String | 12345678901234 | Yes | Creditor account number |
| `RmtInf/Ustrd` | String | Settlement for Oct 21 | No | Unstructured remittance info (narration) |

---

### Complete IMPS XML Example

**Scenario:** 2 instant settlements
**Total Amount:** ₹1,50,000.00
**File Date:** 2025-10-22, 14:30

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>SABPAISA_20251022_143000_001</MsgId>
      <CreDtTm>2025-10-22T14:30:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>150000.00</CtrlSum>
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

    <PmtInf>
      <PmtInfId>BATCH_20251022_001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>150000.00</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>IMPS</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>2025-10-22</ReqdExctnDt>

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

      <CdtTrfTxInf>
        <PmtId>
          <InstrId>TXN_20251022_0001</InstrId>
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

      <CdtTrfTxInf>
        <PmtId>
          <InstrId>TXN_20251022_0002</InstrId>
          <EndToEndId>S2025102105</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="INR">50000.00</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <ClrSysMmbId>
              <MmbId>ICIC0005678</MmbId>
            </ClrSysMmbId>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>RETAILER XYZ LLP</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>87654321098765</Id>
            </Othr>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>Settlement for Oct 21</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>

    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
```

**Validation:**
- ✅ NbOfTxs matches: 2 transactions
- ✅ CtrlSum matches: 100000.00 + 50000.00 = 150000.00
- ✅ Both amounts ≤ ₹2,00,000 (IMPS limit)
- ✅ Valid XML with correct namespace
- ✅ All mandatory fields present

---

### IMPS-Specific Validation

```javascript
function validateIMPSTransaction(transfer) {
  const errors = [];

  // 1. Maximum amount: ₹2,00,000
  if (transfer.amount_paise > 20000000) {
    errors.push({
      field: 'amount_paise',
      value: transfer.amount_paise,
      message: 'IMPS maximum is ₹2,00,000 (20000000 paise)',
      actualAmount: `₹${(transfer.amount_paise / 100).toFixed(2)}`
    });
  }

  // 2. Minimum amount: ₹1
  if (transfer.amount_paise < 100) {
    errors.push({
      field: 'amount_paise',
      value: transfer.amount_paise,
      message: 'IMPS minimum is ₹1 (100 paise)'
    });
  }

  // 3. IFSC code format (11 characters)
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(transfer.bank_ifsc_code)) {
    errors.push({
      field: 'bank_ifsc_code',
      value: transfer.bank_ifsc_code,
      message: 'Invalid IFSC format (should be XXXX0XXXXXX)'
    });
  }

  // 4. Account number length
  if (transfer.bank_account_number.length < 9 || transfer.bank_account_number.length > 18) {
    errors.push({
      field: 'bank_account_number',
      value: transfer.bank_account_number,
      message: 'Account number should be 9-18 digits'
    });
  }

  return errors;
}
```

---

## Validation Rules

### Common Validations (All Formats)

#### 1. Amount Validation

```javascript
function validateAmount(amountPaise, transferMode) {
  const errors = [];

  // Minimum check
  if (amountPaise < 100) {
    errors.push('Amount must be at least ₹1.00');
  }

  // Mode-specific checks
  if (transferMode === 'RTGS' && amountPaise < 20000000) {
    errors.push('RTGS requires minimum ₹2,00,000');
  }

  if (transferMode === 'IMPS' && amountPaise > 20000000) {
    errors.push('IMPS allows maximum ₹2,00,000');
  }

  // Maximum check (system limit)
  if (amountPaise > 999999999999) { // 13 digits max
    errors.push('Amount exceeds maximum allowed (₹9,99,99,99,999.99)');
  }

  return errors;
}
```

#### 2. IFSC Code Validation

```javascript
function validateIFSC(ifscCode) {
  const errors = [];

  // Format: XXXX0XXXXXX (11 characters)
  // First 4: Bank code (alpha)
  // 5th: Always 0
  // Last 6: Branch code (alphanumeric)

  if (!ifscCode || ifscCode.length !== 11) {
    errors.push('IFSC code must be 11 characters');
  }

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
    errors.push('Invalid IFSC format (BANK0BRANCH)');
  }

  // Bank code validation (first 4 chars)
  const validBankCodes = ['HDFC', 'ICIC', 'SBIN', 'AXIS', 'UTIB', 'KKBK', 'PUNB'];
  const bankCode = ifscCode.substring(0, 4);

  if (!validBankCodes.includes(bankCode)) {
    // Warning, not error (allow unknown banks)
    console.warn(`Unknown bank code: ${bankCode}`);
  }

  return errors;
}
```

#### 3. Account Number Validation

```javascript
function validateAccountNumber(accountNumber, bankCode) {
  const errors = [];

  // Remove spaces
  accountNumber = accountNumber.replace(/\s/g, '');

  // Length check (9-18 digits)
  if (accountNumber.length < 9 || accountNumber.length > 18) {
    errors.push('Account number should be 9-18 digits');
  }

  // Numeric check
  if (!/^\d+$/.test(accountNumber)) {
    errors.push('Account number should contain only digits');
  }

  // Bank-specific validation
  if (bankCode === 'HDFC' && accountNumber.length !== 14) {
    console.warn('HDFC account numbers are typically 14 digits');
  }

  if (bankCode === 'ICIC' && accountNumber.length !== 12) {
    console.warn('ICICI account numbers are typically 12 digits');
  }

  return errors;
}
```

#### 4. Beneficiary Name Validation

```javascript
function validateBeneficiaryName(name) {
  const errors = [];

  // Length check
  if (!name || name.trim().length === 0) {
    errors.push('Beneficiary name is required');
  }

  if (name.length > 35) {
    console.warn(`Name will be truncated to 35 chars: ${name.substring(0, 35)}`);
  }

  // Special characters check (some banks reject special chars)
  if (/[^A-Z0-9\s\-&]/.test(name.toUpperCase())) {
    errors.push('Name contains invalid characters (use only A-Z, 0-9, space, -, &)');
  }

  // Reserved words
  const reservedWords = ['TEST', 'DUMMY', 'SAMPLE'];
  if (reservedWords.some(word => name.toUpperCase().includes(word))) {
    console.warn(`Name contains reserved word: ${name}`);
  }

  return errors;
}
```

---

## Error Codes

### Bank Response Error Codes

When banks process NEFT/RTGS/IMPS files, they return response files with status codes:

#### NEFT/RTGS Response Codes

| Code | Status | Description | Action Required |
|------|--------|-------------|-----------------|
| 00 | Success | Transaction processed successfully | Mark as COMPLETED |
| 01 | Rejected | Invalid beneficiary account number | Verify account, retry with correct details |
| 02 | Rejected | Account closed/dormant | Contact merchant for updated account |
| 03 | Rejected | Beneficiary name mismatch | Verify name matches bank records |
| 04 | Rejected | Invalid IFSC code | Verify IFSC, update if incorrect |
| 05 | Rejected | Insufficient balance | Top-up SabPaisa account, retry |
| 06 | Rejected | Transaction limit exceeded | Split into smaller amounts |
| 07 | Rejected | Duplicate transaction reference | Generate new unique reference |
| 08 | Pending | Awaiting bank approval | Poll again after 2 hours |
| 09 | Rejected | Beneficiary bank system down | Retry after 4 hours |
| 10 | Rejected | Invalid file format | Review file generation logic |
| 99 | Error | Internal bank error | Contact bank support |

#### IMPS Response Codes (NPCI)

| Code | Status | Description | Action Required |
|------|--------|-------------|-----------------|
| 00 | Success | Transaction successful | Mark as COMPLETED |
| 91 | Rejected | Beneficiary bank offline | Retry after 30 minutes |
| 92 | Rejected | Invalid beneficiary account | Verify account details |
| 93 | Rejected | IMPS not enabled for beneficiary | Use NEFT instead |
| 94 | Rejected | Transaction limit exceeded (₹2L) | Split or use RTGS |
| 95 | Rejected | Invalid message format | Review XML structure |
| 96 | Rejected | Duplicate transaction | Check EndToEndId uniqueness |
| 97 | Pending | Processing | Poll again after 5 minutes |
| 98 | Rejected | Beneficiary MMID invalid | Verify MMID (mobile money ID) |
| 99 | Error | System error | Contact NPCI support |

### Implementation

```javascript
const BANK_ERROR_CODES = {
  NEFT_RTGS: {
    '00': { status: 'SUCCESS', action: 'COMPLETE', retryable: false },
    '01': { status: 'REJECTED', action: 'VERIFY_ACCOUNT', retryable: true },
    '02': { status: 'REJECTED', action: 'UPDATE_ACCOUNT', retryable: false },
    '03': { status: 'REJECTED', action: 'VERIFY_NAME', retryable: true },
    '04': { status: 'REJECTED', action: 'VERIFY_IFSC', retryable: true },
    '05': { status: 'REJECTED', action: 'TOPUP_BALANCE', retryable: true },
    '06': { status: 'REJECTED', action: 'SPLIT_AMOUNT', retryable: true },
    '07': { status: 'REJECTED', action: 'NEW_REFERENCE', retryable: true },
    '08': { status: 'PENDING', action: 'POLL_AGAIN', retryable: false },
    '09': { status: 'REJECTED', action: 'BANK_DOWN', retryable: true },
    '10': { status: 'REJECTED', action: 'FIX_FORMAT', retryable: false },
    '99': { status: 'ERROR', action: 'CONTACT_BANK', retryable: false }
  },
  IMPS: {
    '00': { status: 'SUCCESS', action: 'COMPLETE', retryable: false },
    '91': { status: 'REJECTED', action: 'BANK_OFFLINE', retryable: true },
    '92': { status: 'REJECTED', action: 'INVALID_ACCOUNT', retryable: true },
    '93': { status: 'REJECTED', action: 'IMPS_DISABLED', retryable: false },
    '94': { status: 'REJECTED', action: 'LIMIT_EXCEEDED', retryable: true },
    '95': { status: 'REJECTED', action: 'INVALID_FORMAT', retryable: false },
    '96': { status: 'REJECTED', action: 'DUPLICATE', retryable: true },
    '97': { status: 'PENDING', action: 'POLL_AGAIN', retryable: false },
    '98': { status: 'REJECTED', action: 'INVALID_MMID', retryable: true },
    '99': { status: 'ERROR', action: 'CONTACT_NPCI', retryable: false }
  }
};

function processBankResponse(transferMode, responseCode) {
  const errorCodes = transferMode === 'IMPS'
    ? BANK_ERROR_CODES.IMPS
    : BANK_ERROR_CODES.NEFT_RTGS;

  const error = errorCodes[responseCode];

  if (!error) {
    return {
      status: 'UNKNOWN',
      action: 'MANUAL_REVIEW',
      retryable: false,
      message: `Unknown response code: ${responseCode}`
    };
  }

  return error;
}
```

---

## Sample Files

### Sample 1: Single NEFT Transaction

**File Name:** `NEFT_SABPAISA01_20251022_001.txt`
**Transactions:** 1
**Amount:** ₹25,000.00

```
H00000HDFC0000001SABP0000012025102201202510221430
BHSABPAISA01SABPAISA MERCHANT SERVICES PVNEFT      B20251022120251022
T0112345678901234  JOHN DOE                       HDFC00012340000002500000Settlement B2025102211    S20251021020251022
BT          B20251022100000001000000250000000
FT          2025102201000000010000000100000025000000
```

---

### Sample 2: Multiple RTGS Transactions

**File Name:** `RTGS_SABPAISA01_20251022_001.txt`
**Transactions:** 3
**Total Amount:** ₹75,00,000.00

```
H00000HDFC0000001SABP0000012025102201202510221015
BHSABPAISA01SABPAISA MERCHANT SERVICES PVRTGS      R20251022120251022
T0198765432109876  ABC CORPORATION LTD            HDFC00045670002500000000Settlement R2025102211    R20251021020251022
T0156789012345678  XYZ ENTERPRISES PVT LTD        ICIC00012340003000000000Settlement R2025102211    R20251021520251022
T0145678901234567  PQR INDUSTRIES LIMITED         AXIS00098760002000000000Settlement R2025102211    R20251022120251022
BT          R20251022100000003000075000000000
FT          2025102201000000010000000300007500000000
```

---

### Sample 3: IMPS XML (Instant Settlement)

**File Name:** `IMPS_SABPAISA01_20251022143000_001.xml`
**Transactions:** 1
**Amount:** ₹50,000.00

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>SABPAISA_20251022_143000_001</MsgId>
      <CreDtTm>2025-10-22T14:30:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>50000.00</CtrlSum>
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
    <PmtInf>
      <PmtInfId>BATCH_20251022_001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>50000.00</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>IMPS</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>2025-10-22</ReqdExctnDt>
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
      <CdtTrfTxInf>
        <PmtId>
          <InstrId>TXN_20251022_0001</InstrId>
          <EndToEndId>S2025102101</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="INR">50000.00</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <ClrSysMmbId>
              <MmbId>HDFC0001234</MmbId>
            </ClrSysMmbId>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>JANE SMITH</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>12345678901234</Id>
            </Othr>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>Instant settlement for Oct 21</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
```

---

## Testing Checklist

### Pre-Generation Checks

- [ ] All transfers have valid merchant_id
- [ ] All transfers have non-null bank_account_number
- [ ] All transfers have valid bank_ifsc_code (11 chars, format XXXX0XXXXXX)
- [ ] All transfers have bank_account_name (not null, max 35 chars)
- [ ] Amounts are positive integers (in paise)
- [ ] RTGS transfers ≥ ₹2,00,000
- [ ] IMPS transfers ≤ ₹2,00,000
- [ ] RTGS generated only during banking hours (Mon-Fri, 9:00 AM - 4:30 PM)
- [ ] File references are unique
- [ ] Batch references are unique

### NEFT File Validation

- [ ] Header record is exactly 135 characters (+ CRLF)
- [ ] Batch header is exactly 135 characters (+ CRLF)
- [ ] All transaction records are exactly 135 characters (+ CRLF)
- [ ] Batch trailer is exactly 135 characters (+ CRLF)
- [ ] File trailer is exactly 135 characters (+ CRLF)
- [ ] Transaction count in batch trailer matches actual count
- [ ] Batch total in batch trailer matches sum of transactions
- [ ] Transaction count in file trailer matches total transactions
- [ ] File total in file trailer matches sum of all batches
- [ ] File reference consistent across header and trailer
- [ ] Batch reference consistent across batch header and trailer
- [ ] Product code is "NEFT      " (10 chars with trailing spaces)
- [ ] All amounts are zero-padded to 13 digits (in paise)
- [ ] File has correct line endings (CRLF, not just LF)
- [ ] File is ASCII encoded (not UTF-8 with BOM)

### RTGS File Validation

- [ ] All NEFT validations apply
- [ ] Product code is "RTGS      " (not "NEFT      ")
- [ ] All transactions ≥ ₹2,00,000
- [ ] File generated during RTGS hours
- [ ] Batch size ≤ 50 transactions (recommended)

### IMPS XML Validation

- [ ] Valid XML syntax (no parsing errors)
- [ ] Correct namespace: urn:iso:std:iso:20022:tech:xsd:pain.001.001.03
- [ ] MsgId is unique
- [ ] NbOfTxs in GrpHdr matches actual transaction count
- [ ] CtrlSum in GrpHdr matches sum of all InstdAmt values
- [ ] NbOfTxs in PmtInf matches transaction count
- [ ] CtrlSum in PmtInf matches transaction sum
- [ ] All amounts are in rupees with 2 decimal places (not paise)
- [ ] All IFSC codes are valid (11 chars)
- [ ] All account numbers are 9-18 digits
- [ ] Service level code is "IMPS"
- [ ] All InstrId values are unique within file
- [ ] All EndToEndId values are unique within file
- [ ] Currency code is "INR"
- [ ] All transactions ≤ ₹2,00,000
- [ ] UTF-8 encoding with XML declaration
- [ ] No special characters in beneficiary names (XML escaped if present)

### Post-Generation Checks

- [ ] File saved to correct directory
- [ ] File permissions are correct (readable by SFTP process)
- [ ] File size > 0 bytes
- [ ] sp_v2_payout_files record created
- [ ] sp_v2_settlement_bank_transfers.file_id updated
- [ ] sp_v2_settlement_bank_transfers.status = 'FILE_GENERATED'
- [ ] File name follows naming convention
- [ ] File reference stored in database matches filename

---

## Quick Reference Tables

### Transfer Mode Comparison

| Feature | NEFT | RTGS | IMPS |
|---------|------|------|------|
| **Format** | Fixed-width text | Fixed-width text | ISO 20022 XML |
| **Extension** | .txt | .txt | .xml |
| **Encoding** | ASCII | ASCII | UTF-8 |
| **Min Amount** | ₹1 | ₹2,00,000 | ₹1 |
| **Max Amount** | No limit | No limit | ₹2,00,000 |
| **Availability** | Mon-Sat, 8 AM - 7 PM | Mon-Fri, 9 AM - 4:30 PM | 24x7 |
| **Settlement** | Batch (hourly) | Real-time | Real-time (instant) |
| **Max Txns/File** | 100 | 50 (recommended) | 100 |
| **Typical SLA** | 2-4 hours | 30 minutes | 15 minutes |
| **Best For** | Standard settlements | Large amounts | Instant settlements |

### File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| NEFT | `NEFT_<CLIENT>_<DATE>_<SEQ>.txt` | NEFT_SABPAISA01_20251022_001.txt |
| RTGS | `RTGS_<CLIENT>_<DATE>_<SEQ>.txt` | RTGS_SABPAISA01_20251022_001.txt |
| IMPS | `IMPS_<CLIENT>_<TIMESTAMP>_<SEQ>.xml` | IMPS_SABPAISA01_20251022143000_001.xml |

### Amount Encoding (NEFT/RTGS)

| Rupees | Paise | Field Value (13 digits) |
|--------|-------|-------------------------|
| ₹1 | 100 | 0000000000100 |
| ₹100 | 10,000 | 0000000010000 |
| ₹1,000 | 1,00,000 | 0000000100000 |
| ₹10,000 | 10,00,000 | 0000001000000 |
| ₹1,00,000 | 1,00,00,000 | 0000100000000 |
| ₹10,00,000 | 10,00,00,000 | 0001000000000 |
| ₹2,00,000 | 2,00,00,000 | 0002000000000 |

---

## Troubleshooting

### Common Issues

#### Issue: "Invalid record length"

**Cause:** Record is not exactly 135 characters
**Solution:** Check all `.padEnd()` and `.padStart()` calls, ensure correct field lengths

#### Issue: "Amount mismatch in trailer"

**Cause:** Sum of transaction amounts doesn't match trailer total
**Solution:** Verify all amounts are in paise, check arithmetic

#### Issue: "RTGS rejected - below minimum"

**Cause:** Transaction amount < ₹2,00,000
**Solution:** Use NEFT or IMPS for amounts below ₹2 lakh

#### Issue: "IMPS rejected - exceeds limit"

**Cause:** Transaction amount > ₹2,00,000
**Solution:** Use RTGS or split into multiple IMPS transactions

#### Issue: "Invalid XML format"

**Cause:** Missing namespace, incorrect element nesting, or special characters not escaped
**Solution:** Validate XML with online validator, check namespace, escape &, <, >, ", '

#### Issue: "SFTP upload failed - file size mismatch"

**Cause:** File corruption during upload or line ending issues
**Solution:** Verify local file size, check CRLF vs LF, retry upload

---

**Document Version:** 1.0
**Last Updated:** October 22, 2025
**Maintained By:** SettlePaisa Engineering Team
**Contact:** For questions, see `PAYOUT_AUTOMATION_TECHNICAL_DESIGN.md`
