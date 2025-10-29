#!/usr/bin/env node

/**
 * Check when transactions were inserted on Oct 26, 2025 in staging database
 * This connects via the Overview API's database pool
 */

const axios = require('axios');

const API_BASE = 'http://13.201.179.44:5108';

async function checkTransactionDetails() {
  try {
    console.log('='.repeat(80));
    console.log('Checking Oct 26, 2025 Transactions in Staging Database');
    console.log('='.repeat(80));
    console.log('');

    // Get overview data for Oct 26
    const response = await axios.get(`${API_BASE}/api/overview?from=2025-10-26&to=2025-10-26`);
    const data = response.data;

    console.log('📊 Overview Data for Oct 26, 2025:');
    console.log('-'.repeat(80));
    console.log('Total Captured:', data.pipeline.captured);
    console.log('Matched:', data.reconciliation.matched);
    console.log('Unmatched:', data.reconciliation.unmatched);
    console.log('Exceptions:', data.reconciliation.exceptions);
    console.log('');

    console.log('By Source:');
    console.log('  Manual:', data.reconciliation.bySource.manual);
    console.log('  Connector:', data.reconciliation.bySource.connector);
    console.log('');

    console.log('Financial:');
    console.log('  Gross Amount: ₹' + (data.financial.grossAmount / 100).toLocaleString('en-IN'));
    console.log('  Reconciled: ₹' + (data.financial.reconciledAmount / 100).toLocaleString('en-IN'));
    console.log('  Unreconciled: ₹' + (data.financial.unreconciledAmount / 100).toLocaleString('en-IN'));
    console.log('');

    // Try to get more detailed data from stats endpoint if available
    try {
      const statsResponse = await axios.get(`${API_BASE}/api/stats?from=2025-10-26&to=2025-10-26`);
      console.log('📈 Stats Data:');
      console.log(JSON.stringify(statsResponse.data, null, 2));
    } catch (err) {
      console.log('ℹ️  Stats endpoint not available or returned error');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log(`There are ${data.pipeline.captured} transactions in the staging database`);
    console.log(`created on October 26, 2025 (IST date).`);
    console.log('');
    console.log('These transactions include:');
    console.log(`  - ${data.reconciliation.bySource.connector} from Connector (PG sync)`);
    console.log(`  - ${data.reconciliation.bySource.manual} from Manual Upload (CSV)`);
    console.log('');
    console.log('The created_at timestamp in the database will show when these');
    console.log('were inserted into sp_v2_transactions table.');
    console.log('');
    console.log('To see exact timestamps, you would need to:');
    console.log('1. SSH into EC2: ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44');
    console.log('2. Connect to database via psql or node script');
    console.log('3. Run: SELECT id, transaction_id, source_type, created_at');
    console.log('        FROM sp_v2_transactions');
    console.log('        WHERE created_at::date = \'2025-10-26\'');
    console.log('        ORDER BY created_at DESC LIMIT 30;');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

checkTransactionDetails();
