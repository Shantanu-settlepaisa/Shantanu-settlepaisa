#!/usr/bin/env node

const { mapV1ToV2 } = require('./services/recon-api/utils/v1-column-mapper.js');

console.log('========== Testing V1 Mapper Case-Insensitivity Fix ==========\n');

// Test 1: Bank data with UPPERCASE keys (from Bank API)
const bankDataUppercase = {
  TRANSACTION_ID: 'TXN20251010001',
  UTR: 'UTR20251010001',
  AMOUNT: 150000,
  DATE: '2025-10-10'
};

console.log('Test 1: Bank data with UPPERCASE keys');
console.log('INPUT:', JSON.stringify(bankDataUppercase, null, 2));

try {
  const converted = mapV1ToV2(bankDataUppercase, 'bank_statements');
  console.log('OUTPUT:', JSON.stringify(converted, null, 2));

  // Verify conversion
  if (converted.bank_ref === 'TXN20251010001' &&
      converted.utr === 'UTR20251010001' &&
      converted.amount_paise === 15000000 &&
      converted.transaction_date) {
    console.log('✅ PASS: All fields converted correctly\n');
  } else {
    console.log('❌ FAIL: Some fields missing or incorrect\n');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ ERROR:', error.message, '\n');
  process.exit(1);
}

// Test 2: Bank data with lowercase keys (from CSV upload)
const bankDataLowercase = {
  transaction_id: 'TXN20251010002',
  utr: 'UTR20251010002',
  amount: 250000,
  date: '2025-10-10'
};

console.log('Test 2: Bank data with lowercase keys');
console.log('INPUT:', JSON.stringify(bankDataLowercase, null, 2));

try {
  const converted = mapV1ToV2(bankDataLowercase, 'bank_statements');
  console.log('OUTPUT:', JSON.stringify(converted, null, 2));

  // Verify conversion
  if (converted.bank_ref === 'TXN20251010002' &&
      converted.utr === 'UTR20251010002' &&
      converted.amount_paise === 25000000 &&
      converted.transaction_date) {
    console.log('✅ PASS: All fields converted correctly\n');
  } else {
    console.log('❌ FAIL: Some fields missing or incorrect\n');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ ERROR:', error.message, '\n');
  process.exit(1);
}

// Test 3: Mixed case keys
const bankDataMixed = {
  Transaction_ID: 'TXN20251010003',
  Utr: 'UTR20251010003',
  Amount: 350000,
  Date: '2025-10-10'
};

console.log('Test 3: Bank data with MixedCase keys');
console.log('INPUT:', JSON.stringify(bankDataMixed, null, 2));

try {
  const converted = mapV1ToV2(bankDataMixed, 'bank_statements');
  console.log('OUTPUT:', JSON.stringify(converted, null, 2));

  // Verify conversion
  if (converted.bank_ref === 'TXN20251010003' &&
      converted.utr === 'UTR20251010003' &&
      converted.amount_paise === 35000000 &&
      converted.transaction_date) {
    console.log('✅ PASS: All fields converted correctly\n');
  } else {
    console.log('❌ FAIL: Some fields missing or incorrect\n');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ ERROR:', error.message, '\n');
  process.exit(1);
}

console.log('========================================');
console.log('✅ All tests passed! Case-insensitive mapping works correctly.');
console.log('========================================');
