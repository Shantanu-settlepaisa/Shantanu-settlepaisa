const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  port: 5432
});

async function clearData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Clearing test data...');
    
    // Delete in correct order due to foreign keys
    await client.query('DELETE FROM sp_v2_recon_matches');
    console.log('✅ Cleared recon_matches');
    
    await client.query('DELETE FROM sp_v2_settlement_items');
    console.log('✅ Cleared settlement_items');
    
    await client.query('DELETE FROM sp_v2_settlements');
    console.log('✅ Cleared settlements');
    
    await client.query('DELETE FROM sp_v2_transactions');
    console.log('✅ Cleared transactions');
    
    await client.query('COMMIT');
    console.log('\n✅ All test data cleared successfully!');
    
    // Verify
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM sp_v2_transactions) as transactions,
        (SELECT COUNT(*) FROM sp_v2_recon_matches) as matches,
        (SELECT COUNT(*) FROM sp_v2_settlement_items) as items,
        (SELECT COUNT(*) FROM sp_v2_settlements) as settlements
    `);
    
    console.log('\n=== Final Counts ===');
    console.log('Transactions:', counts.rows[0].transactions);
    console.log('Recon Matches:', counts.rows[0].matches);
    console.log('Settlement Items:', counts.rows[0].items);
    console.log('Settlements:', counts.rows[0].settlements);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();
