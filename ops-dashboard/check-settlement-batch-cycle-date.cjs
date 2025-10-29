const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkCycleDate() {
  const client = await pool.connect();

  try {
    // Check if cycle_date column exists
    const schemaResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_batches'
      AND column_name = 'cycle_date'
    `);

    console.log('Does cycle_date column exist?', schemaResult.rows.length > 0 ? 'YES' : 'NO');
    console.log('');

    // Get our Oct 28 batch
    const batchResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        created_at,
        total_transactions
      FROM sp_v2_settlement_batches
      WHERE id = '66103ed1-e0c4-4b0b-b2ea-b246409972f5'
    `);

    if (batchResult.rows.length > 0) {
      const batch = batchResult.rows[0];
      console.log('Oct 28 Batch Details:');
      console.log('  ID:', batch.id);
      console.log('  Merchant ID:', batch.merchant_id);
      console.log('  Cycle Date:', batch.cycle_date || 'NULL');
      console.log('  Created At:', batch.created_at);
      console.log('  Total Transactions:', batch.total_transactions);
    } else {
      console.log('Batch not found!');
    }

    console.log('');

    // Check all batches with their cycle dates
    const allBatchesResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        DATE(created_at) as created_date,
        total_transactions
      FROM sp_v2_settlement_batches
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('Recent Settlement Batches (showing cycle_date):');
    allBatchesResult.rows.forEach((batch) => {
      console.log('  ', batch.id.substring(0, 8) + '...',
        '| Merchant:', batch.merchant_id,
        '| Cycle:', batch.cycle_date || 'NULL',
        '| Created:', batch.created_date);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkCycleDate().catch(console.error);
