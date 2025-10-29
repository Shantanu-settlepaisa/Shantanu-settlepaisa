const fs = require('fs');
const axios = require('axios');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    data.push(row);
  }

  return data;
}

async function runE2EReconTest() {
  try {
    console.log('========== E2E RECON TEST ==========\n');

    // Parse CSV files
    console.log('📄 Parsing PG transactions CSV...');
    const pgTransactions = parseCSV('test-e2e-recon-pg.csv');
    console.log(`   ✅ Loaded ${pgTransactions.length} PG transactions`);

    console.log('📄 Parsing Bank statements CSV...');
    const bankRecords = parseCSV('test-e2e-recon-bank.csv');
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

    console.log('\n📄 Response received:');
    console.log(JSON.stringify(response.data, null, 2));

    const job = response.data.job || response.data;
    console.log('\n✅ Reconciliation job started:');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   PG Fetched: ${job.counters.pgFetched}`);
    console.log(`   Bank Fetched: ${job.counters.bankFetched}`);

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
    return jobStatus;

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

runE2EReconTest().then(() => process.exit(0)).catch(() => process.exit(1));
