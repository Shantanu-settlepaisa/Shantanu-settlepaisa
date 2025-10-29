const fs = require('fs');
const axios = require('axios');

async function runFreshRecon() {
  try {
    console.log('========== FRESH RECON TEST ==========\n');

    // Parse CSV files
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
    console.log(`✅ Loaded ${bankData.length} Bank records\n`);

    // Call recon API
    const response = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-09',
      pgTransactions: pgData,
      bankRecords: bankData,
      bankFilename: 'test-e2e-recon-bank.csv',
      dryRun: false
    });

    console.log('✅ Reconciliation Complete:');
    console.log(`   Job ID: ${response.data.jobId}`);
    console.log(`   Matched: ${response.data.counters.matched}`);
    console.log(`   Status: ${response.data.status}\n`);

    return response.data.jobId;

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

runFreshRecon().then(jobId => {
  console.log(`Job ID for verification: ${jobId}`);
  process.exit(0);
}).catch(() => process.exit(1));
