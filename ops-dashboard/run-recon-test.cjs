const axios = require('axios');

async function runReconciliation() {
  try {
    console.log('🔄 Starting reconciliation for 2025-10-09...');
    
    // Fetch uploaded PG transactions
    const pgResponse = await axios.get('http://localhost:5101/api/pg/transactions', {
      params: { cycle: '2025-10-09' }
    });
    
    const pgTxns = pgResponse.data?.transactions || [];
    console.log(`✓ Found ${pgTxns.length} PG transactions in database`);
    
    // Start reconciliation via Recon API
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-09',
      dryRun: false,
      pgTransactions: [],  // Will fetch from DB
      bankRecords: []       // Will fetch from DB
    });
    
    const jobId = reconResponse.data.jobId;
    console.log(`✓ Reconciliation job started: ${jobId}`);
    
    // Poll for completion
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await axios.get(`http://localhost:5103/recon/jobs/${jobId}/status`);
      const status = statusResponse.data.status;
      
      console.log(`   Status: ${status}`);
      
      if (status === 'completed') {
        console.log('\n✅ Reconciliation completed!');
        console.log('   Counters:', statusResponse.data.counters);
        return statusResponse.data;
      } else if (status === 'failed') {
        console.error('\n❌ Reconciliation failed!');
        console.error('   Error:', statusResponse.data.error);
        throw new Error(statusResponse.data.error?.message || 'Reconciliation failed');
      }
      
      attempts++;
    }
    
    throw new Error('Reconciliation timed out after 60 seconds');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

runReconciliation().catch(console.error);
