const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  port: 5432
});

async function checkData() {
  try {
    const transactions = await pool.query('SELECT COUNT(*) FROM sp_v2_transactions');
    const matches = await pool.query('SELECT COUNT(*) FROM sp_v2_recon_matches');
    const settlementItems = await pool.query('SELECT COUNT(*) FROM sp_v2_settlement_items');
    const settlements = await pool.query('SELECT COUNT(*) FROM sp_v2_settlements');
    
    console.log('=== Current Staging Data ===');
    console.log('Transactions:', transactions.rows[0].count);
    console.log('Recon Matches:', matches.rows[0].count);
    console.log('Settlement Items:', settlementItems.rows[0].count);
    console.log('Settlements:', settlements.rows[0].count);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkData();
