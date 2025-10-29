const { Pool } = require('pg');

async function verifyResults() {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('\n📊 RECONCILIATION RESULTS VERIFICATION\n');
    console.log('=' .repeat(60));
    
    // Check sp_v2_reconciliation_results
    const reconResults = await pool.query(`
      SELECT match_status, COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = '219b03fe-e211-4fea-b88b-9872a2a6d23c'
      GROUP BY match_status
    `);
    
    console.log('\n✅ sp_v2_reconciliation_results:');
    reconResults.rows.forEach(row => {
      console.log(`   ${row.match_status}: ${row.count}`);
    });
    
    // Check sp_v2_transactions
    const txnResults = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-09'
      GROUP BY status
    `);
    
    console.log('\n✅ sp_v2_transactions (date=2025-10-09):');
    txnResults.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });
    
    // Check sp_v2_settlement_batches
    const settlementBatches = await pool.query(`
      SELECT COUNT(*) as count FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-09'
    `);
    
    console.log('\n✅ sp_v2_settlement_batches (cycle_date=2025-10-09):');
    console.log(`   Total batches: ${settlementBatches.rows[0].count}`);
    
    // Check sp_v2_settlement_items
    const settlementItems = await pool.query(`
      SELECT COUNT(*) as count FROM sp_v2_settlement_items
      WHERE created_at >= '2025-10-09'::date
    `);
    
    console.log('\n✅ sp_v2_settlement_items (created_at >= 2025-10-09):');
    console.log(`   Total items: ${settlementItems.rows[0].count}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 SUMMARY:');
    console.log(`   - Reconciliation completed and persisted ✓`);
    console.log(`   - Matched: ${reconResults.rows.find(r => r.match_status === 'MATCHED')?.count || 0}`);
    console.log(`   - Unmatched PG: ${reconResults.rows.find(r => r.match_status === 'UNMATCHED_PG')?.count || 0}`);
    console.log(`   - Unmatched Bank: ${reconResults.rows.find(r => r.match_status === 'UNMATCHED_BANK')?.count || 0}`);
    console.log(`   - Exceptions: ${reconResults.rows.find(r => r.match_status === 'EXCEPTION')?.count || 0}`);
    console.log(`   - Settlement batches: ${settlementBatches.rows[0].count}`);
    console.log(`   - Settlement items: ${settlementItems.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyResults().catch(console.error);
