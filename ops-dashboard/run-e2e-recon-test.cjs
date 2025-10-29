const fs = require('fs');
const axios = require('axios');
const csvParser = require('csv-parser');

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function runE2EReconTest() {
  try {
    console.log('========== E2E RECON TEST ==========\n');

    // Parse CSV files
    console.log('📄 Parsing PG transactions CSV...');
    const pgTransactions = await parseCSV('test-e2e-recon-pg.csv');
    console.log(`   ✅ Loaded ${pgTransactions.length} PG transactions`);

    console.log('📄 Parsing Bank statements CSV...');
    const bankRecords = await parseCSV('test-e2e-recon-bank.csv');
    console.log(`   ✅ Loaded ${bankRecords.length} Bank records`);

    // Call recon API with inline data
    console.log('\n🔄 Calling reconciliation API...');
    const response = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-09',
      pgTransactions,
      bankRecords,
      bankFilename: 'test-e2e-recon-bank.csv',
      dryRun: false
    });

    console.log('\n✅ Reconciliation job started:');
    console.log(`   Job ID: ${response.data.job.id}`);
    console.log(`   Status: ${response.data.job.status}`);
    console.log(`   PG Fetched: ${response.data.job.counters.pgFetched}`);
    console.log(`   Bank Fetched: ${response.data.job.counters.bankFetched}`);

    // Wait for job to complete
    console.log('\n⏳ Waiting for job to complete...');
    let jobStatus;
    let attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResponse = await axios.get(`http://localhost:5103/recon/jobs/${response.data.job.id}`);
      jobStatus = statusResponse.data.job;
      attempts++;
      console.log(`   [${attempts}] Status: ${jobStatus.status}, Stage: ${jobStatus.stage || 'unknown'}`);
    } while (jobStatus.status === 'running' && attempts < 30);

    if (jobStatus.status === 'completed') {
      console.log('\n✅ Reconciliation COMPLETED!');
      console.log('\n📊 Final Counts:');
      console.log(`   Matched: ${jobStatus.counters.matched}`);
      console.log(`   Unmatched PG: ${jobStatus.counters.unmatchedPg}`);
      console.log(`   Unmatched Bank: ${jobStatus.counters.unmatchedBank}`);
      console.log(`   Exceptions: ${jobStatus.counters.exceptions}`);

      if (jobStatus.settlementBatchIds && jobStatus.settlementBatchIds.length > 0) {
        console.log('\n💰 Settlement Batches Created:');
        jobStatus.settlementBatchIds.forEach(batchId => {
          console.log(`   ✅ ${batchId}`);
        });
      }
    } else if (jobStatus.status === 'failed') {
      console.log('\n❌ Reconciliation FAILED:');
      console.log(`   Error: ${jobStatus.error?.message || 'Unknown error'}`);
    }

    console.log('\n===================================');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

runE2EReconTest();
