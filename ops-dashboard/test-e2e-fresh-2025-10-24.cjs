#!/usr/bin/env node
/**
 * E2E Test: Upload Fresh V1 Files → Recon → Verify 50/50 Match
 * Date: 2025-10-24
 * Transaction IDs: TXN101-TXN150
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const UPLOAD_API = 'http://13.201.179.44:5109';
const RECON_API = 'http://13.201.179.44:5103';

console.log('================================================================================');
console.log('E2E Test: Upload Fresh V1 Files → Recon → Verify 50/50 Match');
console.log('================================================================================\n');

async function uploadFile(filePath, fileType, sourceType) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('fileType', fileType);
  form.append('sourceType', sourceType);
  form.append('merchantId', 'MERCH001');

  const response = await axios.post(`${UPLOAD_API}/api/upload/single`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  return response.data;
}

async function runRecon() {
  const response = await axios.post(`${RECON_API}/recon/run`, {
    merchantId: 'MERCH001',
    date: '2025-10-24'
  });

  return response.data;
}

async function main() {
  try {
    // Step 1: Upload PG Transactions
    console.log('─'.repeat(80));
    console.log('STEP 1: Upload PG Transactions (V1 format)');
    console.log('─'.repeat(80));
    console.log('\nUploading ./test-pg-fresh-2025-10-24.csv...');

    const pgResult = await uploadFile(
      './test-pg-fresh-2025-10-24.csv',
      'pg_transactions',
      null
    );

    if (pgResult.success) {
      console.log('✅ Upload successful:', pgResult);
    } else {
      console.log('❌ Upload failed:', pgResult);
      return;
    }

    // Step 2: Upload AXIS BANK Statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 2: Upload AXIS BANK Statements (V1 format)');
    console.log('─'.repeat(80));
    console.log('\nUploading ./test-axis-fresh-2025-10-24.csv...');

    const axisResult = await uploadFile(
      './test-axis-fresh-2025-10-24.csv',
      'bank_statements',
      'AXIS BANK'
    );

    if (axisResult.success) {
      console.log('✅ Upload successful:', axisResult);
    } else {
      console.log('❌ Upload failed:', axisResult);
      return;
    }

    // Step 3: Upload BOB Statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 3: Upload BOB Statements (V1 format)');
    console.log('─'.repeat(80));
    console.log('\nUploading ./test-bob-fresh-2025-10-24.csv...');

    const bobResult = await uploadFile(
      './test-bob-fresh-2025-10-24.csv',
      'bank_statements',
      'BOB'
    );

    if (bobResult.success) {
      console.log('✅ Upload successful:', bobResult);
    } else {
      console.log('❌ Upload failed:', bobResult);
      return;
    }

    // Step 4: Upload HDFC BANK Statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 4: Upload HDFC BANK Statements (V1 format)');
    console.log('─'.repeat(80));
    console.log('\nUploading ./test-hdfc-fresh-2025-10-24.csv...');

    const hdfcResult = await uploadFile(
      './test-hdfc-fresh-2025-10-24.csv',
      'bank_statements',
      'HDFC BANK'
    );

    if (hdfcResult.success) {
      console.log('✅ Upload successful:', hdfcResult);
    } else {
      console.log('❌ Upload failed:', hdfcResult);
      return;
    }

    // Step 5: Run Reconciliation
    console.log('\n' + '='.repeat(80));
    console.log('Running Recon...');
    console.log('='.repeat(80) + '\n');

    const reconResult = await runRecon();

    console.log('✅ Recon completed!');
    console.log(JSON.stringify(reconResult, null, 2));

    // Step 6: Verification
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION');
    console.log('='.repeat(80) + '\n');

    const expectedMatched = 50;
    const expectedExceptions = 0;

    const actualMatched = reconResult.counters?.matched || 0;
    const actualExceptions = reconResult.counters?.exceptions || 0;

    console.log(`Expected: ${expectedMatched} matched, ${expectedExceptions} exceptions`);
    console.log(`Actual:   ${actualMatched} matched, ${actualExceptions} exceptions\n`);

    if (actualMatched === expectedMatched && actualExceptions === expectedExceptions) {
      console.log('✅ SUCCESS: All 50 transactions matched!');
      console.log('\nSummary:', reconResult.summary);
    } else {
      console.log(`⚠️  PARTIAL SUCCESS: ${actualMatched}/${expectedMatched} matched, ${actualExceptions} exceptions`);
      console.log('\nSummary:', reconResult.summary);
    }

  } catch (error) {
    console.error('\n❌ E2E Test Failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

main();
