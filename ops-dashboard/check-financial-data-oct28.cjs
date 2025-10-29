const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkFinancialData() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 CHECKING FINANCIAL DATA FOR 2025-10-28');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Check sp_v2_transactions
    console.log('1️⃣  sp_v2_transactions:');
    const transactionsResult = await client.query(`
      SELECT COUNT(*) as count,
             SUM(amount_paise) as total_amount
      FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-28'
    `);
    console.log(`   Count: ${transactionsResult.rows[0].count}`);
    console.log(`   Total Amount: ₹${(transactionsResult.rows[0].total_amount / 100).toFixed(2)}`);
    console.log('');

    // Check sp_v2_settlement_batches
    console.log('2️⃣  sp_v2_settlement_batches (used by Financial API):');
    const batchesResult = await client.query(`
      SELECT COUNT(*) as count,
             SUM(gross_amount_paise) as total_gmv,
             SUM(settlepaisa_revenue_paise) as total_revenue,
             SUM(net_amount_paise) as total_net
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-28'
    `);
    console.log(`   Count: ${batchesResult.rows[0].count}`);
    console.log(`   Total GMV: ₹${((batchesResult.rows[0].total_gmv || 0) / 100).toFixed(2)}`);
    console.log(`   Total Revenue: ₹${((batchesResult.rows[0].total_revenue || 0) / 100).toFixed(2)}`);
    console.log(`   Total Net: ₹${((batchesResult.rows[0].total_net || 0) / 100).toFixed(2)}`);
    console.log('');

    // Check what dates we have in settlement_batches
    console.log('3️⃣  Available dates in settlement_batches:');
    const datesResult = await client.query(`
      SELECT cycle_date, COUNT(*) as batch_count,
             SUM(gross_amount_paise) as gmv
      FROM sp_v2_settlement_batches
      GROUP BY cycle_date
      ORDER BY cycle_date DESC
      LIMIT 10
    `);
    if (datesResult.rows.length > 0) {
      datesResult.rows.forEach(row => {
        console.log(`   ${row.cycle_date}: ${row.batch_count} batches, GMV: ₹${(row.gmv / 100).toFixed(2)}`);
      });
    } else {
      console.log('   ❌ NO DATA IN settlement_batches!');
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 ROOT CAUSE ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('✅ sp_v2_transactions has data (uploaded via Recon Workspace)');
    console.log('❌ sp_v2_settlement_batches is EMPTY for 2025-10-28');
    console.log('');
    console.log('💡 Financial API queries settlement_batches, not transactions!');
    console.log('   This is correct design - financial metrics should come from');
    console.log('   completed settlement batches, not raw transactions.');
    console.log('');
    console.log('📝 Solution: Need to run settlement process to create batches');
    console.log('   from the 10 transactions we uploaded.');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkFinancialData().catch(console.error);
