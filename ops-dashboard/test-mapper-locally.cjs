#!/usr/bin/env node

const { mapV1ToV2 } = require('./services/api/v1-column-mapper.js');

// Test PG transaction
const v1PgRow = {
  transaction_id: 'TXN001',
  client_code: 'MERCH001',
  payee_amount: '50000.00',
  paid_amount: '50000.00',
  payment_mode: 'UPI',
  trans_complete_date: '2025-10-24T10:00:00Z',
  status: 'SUCCESS',
  utr: 'HDFC001TXN001'
};

console.log('=== Testing PG Transaction Mapping ===');
console.log('V1 Input:', JSON.stringify(v1PgRow, null, 2));
const v2PgRow = mapV1ToV2(v1PgRow, 'pg_transactions');
console.log('V2 Output:', JSON.stringify(v2PgRow, null, 2));
console.log('Amount Check: payee_amount=50000.00 → amount_paise=', v2PgRow.amount_paise, '(should be 5000000)');
console.log('');

// Test HDFC bank (Amount column)
const v1HdfcRow = {
  Date: '24-10-2025',
  UTR: 'HDFC001TXN001',
  'Transaction ID': 'TXN001',
  Amount: '50000.00',
  Status: 'SUCCESS',
  Narration: 'IMPS CREDIT'
};

console.log('=== Testing HDFC Bank Statement Mapping ===');
console.log('V1 Input:', JSON.stringify(v1HdfcRow, null, 2));
const v2HdfcRow = mapV1ToV2(v1HdfcRow, 'bank_statements');
console.log('V2 Output:', JSON.stringify(v2HdfcRow, null, 2));
console.log('Amount Check: Amount=50000.00 → amount_paise=', v2HdfcRow.amount_paise, '(should be 5000000)');
console.log('');

// Test AXIS bank (Credit column)
const v1AxisRow = {
  Date: '24/10/2025',
  UTR: 'AXIS001',
  'Transaction Ref': 'TXN004',
  Debit: '0.00',
  Credit: '5000.00',
  Status: 'SUCCESS'
};

console.log('=== Testing AXIS Bank Statement Mapping ===');
console.log('V1 Input:', JSON.stringify(v1AxisRow, null, 2));
const v2AxisRow = mapV1ToV2(v1AxisRow, 'bank_statements');
console.log('V2 Output:', JSON.stringify(v2AxisRow, null, 2));
console.log('Amount Check: Credit=5000.00 → amount_paise=', v2AxisRow.amount_paise, '(should be 500000)');
console.log('');

// Test ICICI bank (Deposit Amount column)
const v1IciciRow = {
  'Transaction Date': '24-Oct-2025',
  'Value Date': '24-Oct-2025',
  UTR: 'ICICI001',
  'Transaction Remarks': 'UPI-TXN046',
  'Withdrawal Amount': '0.00',
  'Deposit Amount': '9000.00',
  Balance: '1234567.00'
};

console.log('=== Testing ICICI Bank Statement Mapping ===');
console.log('V1 Input:', JSON.stringify(v1IciciRow, null, 2));
const v2IciciRow = mapV1ToV2(v1IciciRow, 'bank_statements');
console.log('V2 Output:', JSON.stringify(v2IciciRow, null, 2));
console.log('Amount Check: Deposit Amount=9000.00 → amount_paise=', v2IciciRow.amount_paise, '(should be 900000)');
console.log('');

// Summary
console.log('=== SUMMARY ===');
console.log('PG Transaction: ', v2PgRow.amount_paise === 5000000 ? '✅ PASS' : `❌ FAIL (got ${v2PgRow.amount_paise})`);
console.log('HDFC Bank:      ', v2HdfcRow.amount_paise === 5000000 ? '✅ PASS' : `❌ FAIL (got ${v2HdfcRow.amount_paise})`);
console.log('AXIS Bank:      ', v2AxisRow.amount_paise === 500000 ? '✅ PASS' : `❌ FAIL (got ${v2AxisRow.amount_paise})`);
console.log('ICICI Bank:     ', v2IciciRow.amount_paise === 900000 ? '✅ PASS' : `❌ FAIL (got ${v2IciciRow.amount_paise})`);
