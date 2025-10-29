#!/usr/bin/env node
/**
 * Generate Fresh Test Data for 2025-10-24
 * Creates 4 CSV files with new transaction IDs (TXN101-TXN150)
 */

const fs = require('fs');
const path = require('path');

const TEST_DATE = '2025-10-24';

// Generate PG Transactions (50 rows, TXN101-TXN150)
function generatePGTransactions() {
  const headers = ['transaction_id', 'client_code', 'payee_amount', 'paid_amount', 'payment_mode', 'trans_complete_date', 'status', 'utr', 'pg_name'];
  const rows = [headers.join(',')];

  const paymentModes = ['UPI', 'CARD', 'NETBANKING', 'UPI', 'UPI'];

  for (let i = 101; i <= 150; i++) {
    const txnId = `TXN${String(i).padStart(3, '0')}`;
    const amount = (Math.floor(Math.random() * 50) + 1) * 1000; // Random 1K-50K
    const paymentMode = paymentModes[(i - 101) % paymentModes.length];
    const hour = 10 + Math.floor((i - 101) / 10);
    const minute = ((i - 101) % 10) * 5;
    const timestamp = `${TEST_DATE} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

    // UTR format depends on bank
    let utr, bank;
    if (i <= 110) {
      utr = `AXIS${String(i).padStart(3, '0')}`;
      bank = 'AXIS';
    } else if (i <= 120) {
      utr = txnId; // BOB uses transaction_id as UTR
      bank = 'BOB';
    } else {
      utr = `HDFC${String(i).padStart(3, '0')}`;
      bank = 'HDFC';
    }

    rows.push([
      txnId,
      'MERCH001',
      amount.toFixed(2),
      amount.toFixed(2),
      paymentMode,
      timestamp,
      'SUCCESS',
      utr,
      'RAZORPAY'
    ].join(','));
  }

  return rows.join('\n');
}

// Generate AXIS Bank Statements (10 rows, TXN101-TXN110)
function generateAXISStatements() {
  const headers = ['Amount', 'PRNNo', 'Date'];
  const rows = [headers.join(',')];

  for (let i = 101; i <= 110; i++) {
    const txnId = `TXN${String(i).padStart(3, '0')}`;
    const amount = (Math.floor(Math.random() * 50) + 1) * 1000;

    rows.push([
      amount.toFixed(2),
      txnId,
      '24/10/2025'
    ].join(','));
  }

  return rows.join('\n');
}

// Generate BOB Statements (10 rows, TXN111-TXN120)
function generateBOBStatements() {
  const headers = ['Settlement Amount', 'Net Amount', 'Merchant Track ID', 'Payment Date', 'Transaction Date', 'Onus Indicator'];
  const rows = [headers.join(',')];

  for (let i = 111; i <= 120; i++) {
    const txnId = `TXN${String(i).padStart(3, '0')}`;
    const amount = (Math.floor(Math.random() * 50) + 1) * 1000;

    rows.push([
      amount.toFixed(2),
      amount.toFixed(2),
      txnId,
      '24-10-2025',
      '24-10-2025',
      'N'
    ].join(','));
  }

  return rows.join('\n');
}

// Generate HDFC Bank Statements (30 rows, TXN121-TXN150)
function generateHDFCStatements() {
  const headers = ['MERCHANT_TRACKID', 'DOMESTIC AMT', 'SETTLE DATE', 'TRANS DATE'];
  const rows = [headers.join(',')];

  for (let i = 121; i <= 150; i++) {
    const txnId = `HDFC${String(i).padStart(3, '0')}`;
    const amount = (Math.floor(Math.random() * 100) + 10) * 1000; // 10K-110K

    rows.push([
      txnId,
      amount.toFixed(2),
      '24-10-2025',
      '24-10-2025'
    ].join(','));
  }

  return rows.join('\n');
}

// Write files
console.log('🔧 Generating fresh test data for 2025-10-24...\n');

const files = [
  { name: 'test-pg-fresh-2025-10-24.csv', generator: generatePGTransactions, desc: '50 PG Transactions (TXN101-TXN150)' },
  { name: 'test-axis-fresh-2025-10-24.csv', generator: generateAXISStatements, desc: '10 AXIS Statements (TXN101-TXN110)' },
  { name: 'test-bob-fresh-2025-10-24.csv', generator: generateBOBStatements, desc: '10 BOB Statements (TXN111-TXN120)' },
  { name: 'test-hdfc-fresh-2025-10-24.csv', generator: generateHDFCStatements, desc: '30 HDFC Statements (TXN121-TXN150)' }
];

files.forEach(({ name, generator, desc }) => {
  const content = generator();
  const filepath = path.join(__dirname, name);
  fs.writeFileSync(filepath, content);
  console.log(`✅ Created: ${name}`);
  console.log(`   ${desc}`);
  console.log(`   Lines: ${content.split('\n').length - 1} data rows\n`);
});

console.log('✨ All files generated successfully!');
console.log('\nNext steps:');
console.log('1. Run: node test-e2e-fresh-2025-10-24.cjs');
console.log('2. Verify: 50/50 recon match');
console.log('3. Check: Settlement batch creation');
