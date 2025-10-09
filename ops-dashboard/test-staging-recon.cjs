const fs = require('fs');
const axios = require('axios');

/**
 * Test reconciliation on AWS Staging (OLD CODE - v2.27.0)
 *
 * Purpose: Verify if staging has the same V1 format detection bug as local did
 *
 * Expected behavior if bug exists:
 * - 0 MATCHED
 * - 23 EXCEPTIONS (amount mismatch: PG ₹0.00 vs Bank ₹1500.00)
 * - No settlement batch created (because matched = 0)
 *
 * If we get these results, it confirms the bug exists on staging too,
 * justifying deployment of v2.32.0 with the fix.
 */

const STAGING_RECON_API = 'http://13.201.179.44:5103';

async function testStagingRecon() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  TESTING RECON ON AWS STAGING (OLD CODE v2.27.0)         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📍 Staging Recon API:', STAGING_RECON_API);
    console.log('📝 Testing with V1 CSV format (lowercase_underscore headers)\n');

    // Load test CSV files
    const pgData = fs.readFileSync('test-e2e-recon-pg.csv', 'utf-8')
      .trim().split('\n').slice(1)
      .map(line => {
        const [transaction_id, client_code, payee_amount, paid_amount, trans_complete_date, payment_mode, payment_gateway, utr, status] = line.split(',');
        return { transaction_id, client_code, payee_amount, paid_amount, trans_complete_date, payment_mode, payment_gateway, utr, status };
      });

    const bankData = fs.readFileSync('test-e2e-recon-bank.csv', 'utf-8')
      .trim().split('\n').slice(1)
      .map(line => {
        const [transaction_id, utr, amount, date, bank_name, status, remarks] = line.split(',');
        return { transaction_id, utr, amount, date, bank_name, status, remarks };
      });

    console.log(`✅ Loaded ${pgData.length} PG transactions`);
    console.log(`✅ Loaded ${bankData.length} Bank statements\n`);

    console.log('Sample PG transaction (lowercase_underscore format):');
    console.log(JSON.stringify(pgData[0], null, 2));
    console.log('');

    console.log('🚀 Calling staging Recon API...\n');

    const startTime = Date.now();

    const response = await axios.post(`${STAGING_RECON_API}/recon/run`, {
      date: '2025-10-09',
      pgTransactions: pgData,
      bankRecords: bankData,
      bankFilename: 'test-e2e-recon-bank.csv',
      dryRun: false
    }, {
      timeout: 60000 // 60 second timeout
    });

    const duration = Date.now() - startTime;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('RECONCILIATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Job ID: ${response.data.jobId}`);
    console.log(`Status: ${response.data.status}`);
    console.log(`Duration: ${duration}ms\n`);

    console.log('Counters:');
    console.log(`  ✅ MATCHED: ${response.data.counters.matched || 0}`);
    console.log(`  ⚠️  EXCEPTIONS: ${response.data.counters.exceptions || 0}`);
    console.log(`  ❌ UNMATCHED_PG: ${response.data.counters.unmatched_pg || 0}`);
    console.log(`  ❌ UNMATCHED_BANK: ${response.data.counters.unmatched_bank || 0}\n`);

    // Analyze results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════');

    const matched = response.data.counters.matched || 0;
    const exceptions = response.data.counters.exceptions || 0;

    if (matched === 0 && exceptions === 23) {
      console.log('❌ BUG CONFIRMED ON STAGING!');
      console.log('');
      console.log('The OLD code (v2.27.0) has the same V1 format detection bug:');
      console.log('  - V1 format detection FAILED (only checks Title Case)');
      console.log('  - CSV has lowercase_underscore headers');
      console.log('  - Result: All 23 transactions became EXCEPTIONS');
      console.log('  - Amount conversion failed: ₹0.00 instead of actual amounts');
      console.log('  - Settlement NOT triggered (matched = 0)');
      console.log('');
      console.log('✅ RECOMMENDATION: Deploy v2.32.0 with the fix to staging');
      console.log('');
      console.log('The fix will:');
      console.log('  1. Detect both Title Case AND lowercase_underscore formats');
      console.log('  2. Convert amounts correctly (23 MATCHED instead of 23 EXCEPTIONS)');
      console.log('  3. Trigger settlement calculation automatically');
      console.log('  4. Create settlement batch with correct calculations');

    } else if (matched === 23) {
      console.log('✅ STAGING ALREADY WORKS!');
      console.log('');
      console.log('Unexpected: Staging code handles lowercase_underscore format correctly.');
      console.log('This suggests either:');
      console.log('  1. Staging has a different version than documented');
      console.log('  2. Staging has different CSV handling logic');
      console.log('  3. The fix was already deployed but not documented');
      console.log('');
      console.log('⚠️  RECOMMENDATION: Verify staging code version and review deployment history');

    } else {
      console.log('⚠️  UNEXPECTED RESULTS!');
      console.log('');
      console.log(`Expected: 0 MATCHED, 23 EXCEPTIONS (if bug exists)`);
      console.log(`Expected: 23 MATCHED, 0 EXCEPTIONS (if fix already deployed)`);
      console.log(`Got: ${matched} MATCHED, ${exceptions} EXCEPTIONS`);
      console.log('');
      console.log('Manual investigation needed to understand staging behavior.');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // Settlement batch check
    if (response.data.settlementBatchIds && response.data.settlementBatchIds.length > 0) {
      console.log('✅ Settlement batch created:');
      console.log(`   Batch IDs: ${response.data.settlementBatchIds.join(', ')}`);
    } else {
      console.log('❌ No settlement batch created (expected if matched = 0)');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

    return {
      matched,
      exceptions,
      bugExists: matched === 0 && exceptions === 23,
      jobId: response.data.jobId
    };

  } catch (error) {
    console.error('❌ ERROR:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Cannot connect to staging Recon API');
      console.error('   Make sure the API is running at:', STAGING_RECON_API);
    } else if (error.response) {
      console.error('\n⚠️  API Error Response:');
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }

    throw error;
  }
}

// Run the test
testStagingRecon()
  .then(result => {
    console.log('Test Result:', result);
    process.exit(result.bugExists ? 0 : 1);
  })
  .catch(() => {
    process.exit(1);
  });
