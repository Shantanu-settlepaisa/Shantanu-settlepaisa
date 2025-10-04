/**
 * Test Two-Stage Bank Normalization
 * 
 * Tests: Bank Raw → V1 Standard → V2 Standard
 */

const { detectBankFromFilename, applyBankToV1Mapping, normalizeBankData } = require('./services/recon-api/utils/bank-normalizer');

console.log('========================================');
console.log('TEST: Bank File Normalization (Two-Stage)');
console.log('========================================\n');

// Test 1: Bank Detection
console.log('TEST 1: Bank Detection from Filename');
console.log('-------------------------------------');

const testFilenames = [
  'HDFC_BANK_20251003.xlsx',
  'axis_settlements.csv',
  'SBI_Statement.xlsx',
  'ICICI_Bank_Report.csv',
  'unknown_bank.csv'
];

testFilenames.forEach(filename => {
  const detected = detectBankFromFilename(filename);
  console.log(`  ${filename} → ${detected || 'NOT DETECTED'}`);
});
console.log('');

// Test 2: Bank → V1 Mapping (HDFC Example)
console.log('TEST 2: Bank Raw → V1 Standard (HDFC)');
console.log('-------------------------------------');

const hdfcRawData = [
  {
    'MERCHANT_TRACKID': 'UTR123456',
    'DOMESTIC AMT': '2500.50',
    'Net Amount': '2475.50',
    'TRANS DATE': '2025-10-03T10:30:00',
    'SETTLE DATE': '2025-10-03T18:00:00'
  }
];

const hdfcV1Mappings = {
  transaction_id: 'MERCHANT_TRACKID',
  paid_amount: 'DOMESTIC AMT',
  payee_amount: 'Net Amount',
  transaction_date_time: 'TRANS DATE',
  payment_date_time: 'SETTLE DATE'
};

const v1Data = applyBankToV1Mapping(hdfcRawData, hdfcV1Mappings);
console.log('  HDFC Raw Data:');
console.log('   ', JSON.stringify(hdfcRawData[0], null, 4));
console.log('\n  V1 Standard Data:');
console.log('   ', JSON.stringify(v1Data[0], null, 4));
console.log('');

// Test 3: Complete Two-Stage Normalization
console.log('TEST 3: Complete Two-Stage Normalization (HDFC)');
console.log('-------------------------------------');

const hdfcBankMapping = {
  config_name: 'HDFC BANK',
  bank_name: 'HDFC BANK',
  file_type: 'xlsx',
  delimiter: null,
  v1_column_mappings: hdfcV1Mappings
};

const v2Data = normalizeBankData(hdfcRawData, hdfcBankMapping);
console.log('  V2 Standard Data:');
console.log('   ', JSON.stringify(v2Data[0], null, 4));
console.log('');

// Test 4: Multiple Records
console.log('TEST 4: Batch Normalization (3 records)');
console.log('-------------------------------------');

const axisRawData = [
  { 'PRNNo': 'TXN001', 'Amount': '1000', 'Date': '2025-10-03' },
  { 'PRNNo': 'TXN002', 'Amount': '2000', 'Date': '2025-10-03' },
  { 'PRNNo': 'TXN003', 'Amount': '1500.50', 'Date': '2025-10-03' }
];

const axisV1Mappings = {
  transaction_id: 'PRNNo',
  paid_amount: 'Amount',
  payee_amount: 'Amount',
  transaction_date_time: 'Date',
  payment_date_time: 'Date'
};

const axisBankMapping = {
  config_name: 'AXIS BANK',
  bank_name: 'AXIS BANK',
  file_type: 'txt',
  delimiter: '~',
  v1_column_mappings: axisV1Mappings
};

const axisV2Data = normalizeBankData(axisRawData, axisBankMapping);
console.log(`  Normalized ${axisV2Data.length} AXIS bank records`);
axisV2Data.forEach((record, idx) => {
  console.log(`    Record ${idx + 1}: UTR=${record.utr}, Amount=${record.amount_paise} paise`);
});
console.log('');

// Test 5: Validation
console.log('TEST 5: Validation Checks');
console.log('-------------------------------------');

const { validateV2BankRecord } = require('./services/recon-api/utils/bank-normalizer');

const testRecords = [
  { utr: 'UTR123', amount_paise: 100000, transaction_date: '2025-10-03', bank_name: 'HDFC' },
  { rrn: 'RRN456', amount_paise: 50000, transaction_date: '2025-10-03', bank_name: 'AXIS' },
  { amount_paise: 75000, transaction_date: '2025-10-03', bank_name: 'SBI' }, // Missing identifiers
  { utr: 'UTR789', transaction_date: '2025-10-03', bank_name: 'ICICI' } // Missing amount
];

testRecords.forEach((record, idx) => {
  const validation = validateV2BankRecord(record);
  console.log(`  Record ${idx + 1}: ${validation.valid ? '✅ VALID' : '❌ INVALID'}`);
  if (!validation.valid) {
    console.log(`    Errors: ${validation.errors.join(', ')}`);
  }
});
console.log('');

console.log('========================================');
console.log('✅ All Tests Completed');
console.log('========================================');
