#!/usr/bin/env node

const iciciRow = {
  'Transaction Date': '24-Oct-2025',
  'Value Date': '24-Oct-2025',
  'UTR': 'ICICI001',
  'Transaction Remarks': 'UPI-TXN046',
  'Withdrawal Amount': '0.00',
  'Deposit Amount': '9000.00',
  'Balance': '1234567.00'
};

console.log('Original keys:', Object.keys(iciciRow));

const normalizedRow = {};
for (const [key, value] of Object.entries(iciciRow)) {
  const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
  normalizedRow[normalizedKey] = value;
  console.log(`"${key}" → "${normalizedKey}"`);
}

console.log('\nNormalized row:', normalizedRow);
console.log('\nnormalizedRow.deposit_amount:', normalizedRow.deposit_amount);
console.log('normalizedRow.withdrawal_amount:', normalizedRow.withdrawal_amount);
