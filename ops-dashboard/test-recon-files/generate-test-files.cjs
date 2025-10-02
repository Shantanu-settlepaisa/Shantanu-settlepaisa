/**
 * Generate V1 format test files for reconciliation testing
 * Creates PG transactions and Bank statements with various match scenarios
 */

const fs = require('fs');
const path = require('path');

// Test date - Oct 2, 2025 (tomorrow from current Oct 1)
const testDate = '2025-10-02';
const dateStr = testDate.replace(/-/g, '');

// Merchants and banks
const MERCHANTS = ['MERCH001', 'MERCH002', 'MERCH003'];
const BANKS = ['AXIS', 'HDFC', 'ICICI', 'SBI'];
const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min = 10000, max = 1000000) {
  return Math.floor(Math.random() * (max - min) + min);
}

function generateUTR(index) {
  return `UTR${dateStr}${String(index).padStart(6, '0')}`;
}

function generateRRN(index) {
  return `${dateStr}${String(index).padStart(12, '0')}`;
}

function generateTxnId(index) {
  return `TXN${dateStr}${String(index).padStart(6, '0')}`;
}

// Scenario counts
const PERFECT_MATCHES = 15;      // Exact UTR and amount match
const AMOUNT_MISMATCH = 5;       // Same UTR, different amount
const MISSING_IN_BANK = 8;       // In PG but not in bank
const MISSING_IN_PG = 3;         // In bank but not in PG
const DUPLICATE_UTR = 2;         // Same UTR appears twice

const TOTAL_PG = PERFECT_MATCHES + AMOUNT_MISMATCH + MISSING_IN_BANK + DUPLICATE_UTR;
const TOTAL_BANK = PERFECT_MATCHES + AMOUNT_MISMATCH + MISSING_IN_PG;

console.log('📝 Generating V1 format reconciliation test files...\n');
console.log('Test Scenarios:');
console.log(`  ✓ Perfect matches: ${PERFECT_MATCHES}`);
console.log(`  ⚠️  Amount mismatches: ${AMOUNT_MISMATCH}`);
console.log(`  ❌ Missing in bank: ${MISSING_IN_BANK}`);
console.log(`  ❌ Missing in PG: ${MISSING_IN_PG}`);
console.log(`  ⚠️  Duplicate UTR: ${DUPLICATE_UTR}`);
console.log(`\n📊 Expected Results:`);
console.log(`  Total PG transactions: ${TOTAL_PG}`);
console.log(`  Total Bank statements: ${TOTAL_BANK}`);
console.log(`  Expected matches: ${PERFECT_MATCHES}`);
console.log(`  Expected exceptions: ${AMOUNT_MISMATCH + MISSING_IN_BANK + DUPLICATE_UTR + MISSING_IN_PG}\n`);

// Generate PG Transactions CSV
const pgRows = [
  'Transaction ID,Merchant ID,Amount,Currency,Transaction Date,Transaction Time,Payment Method,UTR,RRN,Status'
];

let index = 1;

// 1. Perfect matches
for (let i = 0; i < PERFECT_MATCHES; i++, index++) {
  const merchant = randomItem(MERCHANTS);
  const amount = randomAmount();
  const method = randomItem(PAYMENT_METHODS);
  const utr = generateUTR(index);
  const rrn = method === 'UPI' ? generateRRN(index) : '';
  const time = `${String(Math.floor(Math.random() * 10) + 10).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
  
  pgRows.push(
    `${generateTxnId(index)},${merchant},${amount / 100},INR,${testDate},${time},${method},${utr},${rrn},SUCCESS`
  );
}

// 2. Amount mismatches (same UTR, different amount)
for (let i = 0; i < AMOUNT_MISMATCH; i++, index++) {
  const merchant = randomItem(MERCHANTS);
  const amount = randomAmount();
  const method = randomItem(PAYMENT_METHODS);
  const utr = generateUTR(index);
  const rrn = method === 'UPI' ? generateRRN(index) : '';
  const time = `${String(Math.floor(Math.random() * 10) + 10).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
  
  pgRows.push(
    `${generateTxnId(index)},${merchant},${amount / 100},INR,${testDate},${time},${method},${utr},${rrn},SUCCESS`
  );
}

// 3. Missing in bank (PG only)
for (let i = 0; i < MISSING_IN_BANK; i++, index++) {
  const merchant = randomItem(MERCHANTS);
  const amount = randomAmount();
  const method = randomItem(PAYMENT_METHODS);
  const utr = generateUTR(index);
  const rrn = method === 'UPI' ? generateRRN(index) : '';
  const time = `${String(Math.floor(Math.random() * 10) + 10).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
  
  pgRows.push(
    `${generateTxnId(index)},${merchant},${amount / 100},INR,${testDate},${time},${method},${utr},${rrn},SUCCESS`
  );
}

// 4. Duplicate UTR scenario
const duplicateUTR = generateUTR(999);
for (let i = 0; i < DUPLICATE_UTR; i++, index++) {
  const merchant = randomItem(MERCHANTS);
  const amount = randomAmount();
  const method = randomItem(PAYMENT_METHODS);
  const rrn = method === 'UPI' ? generateRRN(index) : '';
  const time = `${String(Math.floor(Math.random() * 10) + 10).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
  
  pgRows.push(
    `${generateTxnId(index)},${merchant},${amount / 100},INR,${testDate},${time},${method},${duplicateUTR},${rrn},SUCCESS`
  );
}

// Write PG file
const pgFilePath = path.join(__dirname, `pg_transactions_${testDate}.csv`);
fs.writeFileSync(pgFilePath, pgRows.join('\n'));
console.log(`✅ Created PG file: ${pgFilePath}`);
console.log(`   Rows: ${pgRows.length - 1}\n`);

// Generate Bank Statements CSV
const bankRows = [
  'Bank Reference,Bank Name,Amount,Transaction Date,Value Date,UTR,Remarks,Debit/Credit'
];

let bankIndex = 1;
let pgIndex = 1;

// 1. Perfect matches (same UTR and amount)
for (let i = 0; i < PERFECT_MATCHES; i++, bankIndex++, pgIndex++) {
  const bank = randomItem(BANKS);
  const utr = generateUTR(pgIndex);
  // Parse amount from PG row to match exactly
  const pgRow = pgRows[pgIndex].split(',');
  const amount = pgRow[2]; // Already in rupees
  
  bankRows.push(
    `BANK${dateStr}${String(bankIndex).padStart(6, '0')},${bank},${amount},${testDate},${testDate},${utr},Settlement for ${testDate},CREDIT`
  );
}

// 2. Amount mismatches (same UTR, different amount)
for (let i = 0; i < AMOUNT_MISMATCH; i++, bankIndex++, pgIndex++) {
  const bank = randomItem(BANKS);
  const utr = generateUTR(pgIndex);
  const pgRow = pgRows[pgIndex].split(',');
  const pgAmount = parseFloat(pgRow[2]);
  // Create mismatch: add/subtract 100 rupees
  const bankAmount = pgAmount + (Math.random() > 0.5 ? 100 : -100);
  
  bankRows.push(
    `BANK${dateStr}${String(bankIndex).padStart(6, '0')},${bank},${bankAmount.toFixed(2)},${testDate},${testDate},${utr},Settlement mismatch,CREDIT`
  );
}

// 3. Skip missing in bank entries (they're only in PG)
pgIndex += MISSING_IN_BANK;

// 4. Missing in PG (bank only) - use unique UTRs
for (let i = 0; i < MISSING_IN_PG; i++, bankIndex++) {
  const bank = randomItem(BANKS);
  const amount = randomAmount();
  const utr = `UTRBANK${dateStr}${String(bankIndex).padStart(6, '0')}`;
  
  bankRows.push(
    `BANK${dateStr}${String(bankIndex).padStart(6, '0')},${bank},${amount / 100},${testDate},${testDate},${utr},Unmatched bank credit,CREDIT`
  );
}

// Write Bank file
const bankFilePath = path.join(__dirname, `bank_statement_${testDate}.csv`);
fs.writeFileSync(bankFilePath, bankRows.join('\n'));
console.log(`✅ Created Bank file: ${bankFilePath}`);
console.log(`   Rows: ${bankRows.length - 1}\n`);

// Generate summary report
const summary = `
RECONCILIATION TEST FILES SUMMARY
==================================
Date: ${testDate}
Generated: ${new Date().toISOString()}

FILES CREATED:
1. ${path.basename(pgFilePath)} (${pgRows.length - 1} transactions)
2. ${path.basename(bankFilePath)} (${bankRows.length - 1} statements)

EXPECTED RECONCILIATION RESULTS:
---------------------------------
✅ Perfect Matches: ${PERFECT_MATCHES}
   - Same UTR, same amount

⚠️  Amount Mismatches: ${AMOUNT_MISMATCH}
   - Same UTR, different amount (~₹100 variance)

❌ Missing in Bank: ${MISSING_IN_BANK}
   - PG transaction exists, no bank statement

❌ Missing in PG: ${MISSING_IN_PG}
   - Bank statement exists, no PG transaction

⚠️  Duplicate UTR: ${DUPLICATE_UTR}
   - Same UTR used in multiple PG transactions

TOTALS:
-------
PG Transactions: ${TOTAL_PG}
Bank Statements: ${TOTAL_BANK}
Expected Reconciled: ${PERFECT_MATCHES}
Expected Exceptions: ${AMOUNT_MISMATCH + MISSING_IN_BANK + DUPLICATE_UTR + MISSING_IN_PG}

Match Rate: ${((PERFECT_MATCHES / TOTAL_PG) * 100).toFixed(1)}%

TEST INSTRUCTIONS:
------------------
1. Upload ${path.basename(pgFilePath)} as PG transactions
2. Upload ${path.basename(bankFilePath)} as Bank statement
3. Verify reconciliation results match expected counts
4. Check exception reasons:
   - AMOUNT_MISMATCH: ${AMOUNT_MISMATCH}
   - MISSING_UTR (bank): ${MISSING_IN_BANK}
   - MISSING_UTR (pg): ${MISSING_IN_PG}
   - DUPLICATE_UTR: ${DUPLICATE_UTR}
`;

const summaryPath = path.join(__dirname, 'TEST_SUMMARY.txt');
fs.writeFileSync(summaryPath, summary);
console.log(`📄 Created summary: ${summaryPath}\n`);
console.log(summary);
