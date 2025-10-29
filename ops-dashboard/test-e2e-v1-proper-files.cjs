#!/usr/bin/env node

const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const UPLOAD_API = 'http://13.201.179.44:5109';
const RECON_API = 'http://13.201.179.44:5103';

console.log('='.repeat(80));
console.log('E2E Test: Upload Proper V1 Files → Recon → Verify 50/50 Match');
console.log('='.repeat(80));

async function uploadFile(filePath, fileType, sourceType) {
  console.log(`\nUploading ${filePath}...`);

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('fileType', fileType);
  form.append('sourceType', sourceType);
  form.append('merchantId', 'MERCH001');

  try {
    const response = await axios.post(`${UPLOAD_API}/api/upload/single`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log(`✅ Upload successful:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ Upload failed:`, error.response?.data || error.message);
    throw error;
  }
}

async function runRecon() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Running Recon...');
  console.log('='.repeat(80));

  try {
    const response = await axios.post(`${RECON_API}/recon/run`, {
      merchantId: 'MERCH001',
      startDate: '2025-10-24',
      endDate: '2025-10-24'
    });

    console.log('\n✅ Recon completed!');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Recon failed:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    // Step 1: Upload PG transactions
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 1: Upload PG Transactions (V1 format)');
    console.log('─'.repeat(80));
    await uploadFile(
      './test-pg-v1-proper-2025-10-24.csv',
      'pg_transactions',
      'manual_upload'
    );

    // Step 2: Upload AXIS BANK statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 2: Upload AXIS BANK Statements (V1 format)');
    console.log('─'.repeat(80));
    await uploadFile(
      './test-axis-v1-proper-2025-10-24.csv',
      'bank_statements',
      'AXIS BANK'
    );

    // Step 3: Upload BOB statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 3: Upload BOB Statements (V1 format)');
    console.log('─'.repeat(80));
    await uploadFile(
      './test-bob-v1-proper-2025-10-24.csv',
      'bank_statements',
      'BOB'
    );

    // Step 4: Upload HDFC BANK statements
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 4: Upload HDFC BANK Statements (V1 format)');
    console.log('─'.repeat(80));
    await uploadFile(
      './test-hdfc-v1-proper-2025-10-24.csv',
      'bank_statements',
      'HDFC BANK'
    );

    // Step 5: Run recon
    const reconResult = await runRecon();

    // Step 6: Verify results
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION');
    console.log('='.repeat(80));

    const { matched = 0, exceptions = 0, summary } = reconResult;

    console.log(`\nExpected: 50 matched, 0 exceptions`);
    console.log(`Actual:   ${matched} matched, ${exceptions} exceptions`);

    if (matched === 50 && exceptions === 0) {
      console.log('\n✅ SUCCESS! Perfect 50/50 match - V1→V2 mapper working correctly!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  PARTIAL SUCCESS: ${matched}/50 matched, ${exceptions} exceptions`);
      console.log('\nSummary:', summary);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ E2E Test Failed:', error.message);
    process.exit(1);
  }
}

main();
