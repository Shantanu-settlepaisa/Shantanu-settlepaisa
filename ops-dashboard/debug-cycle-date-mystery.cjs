const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugMystery() {
  const client = await pool.connect();

  try {
    console.log('Debugging the cycle_date mystery:');
    console.log('');

    // Get ALL batches to see what's there
    const allBatchesResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        to_char(cycle_date, 'YYYY-MM-DD') as cycle_date_str,
        cycle_date::text as cycle_date_text,
        created_at
      FROM sp_v2_settlement_batches
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('All settlement batches:');
    allBatchesResult.rows.forEach((row, idx) => {
      console.log(`\nBatch ${idx + 1}:`);
      console.log('  ID:', row.id);
      console.log('  Merchant:', row.merchant_id);
      console.log('  cycle_date (raw):', row.cycle_date);
      console.log('  cycle_date (to_char):', row.cycle_date_str);
      console.log('  cycle_date (::text):', row.cycle_date_text);
      console.log('  created_at:', row.created_at);
    });

    console.log('\n\n═══════════════════════════════════════════');

    // Try matching our specific batch
    const ourBatchResult = await client.query(`
      SELECT
        id,
        cycle_date,
        to_char(cycle_date, 'YYYY-MM-DD') as cycle_date_str
      FROM sp_v2_settlement_batches
      WHERE id = '66103ed1-e0c4-4b0b-b2ea-b246409972f5'
    `);

    if (ourBatchResult.rows.length > 0) {
      const batch = ourBatchResult.rows[0];
      console.log('\nOur Oct 28 batch:');
      console.log('  Cycle date (to_char):', batch.cycle_date_str);

      // Try matching with this exact value
      const matchResult = await client.query(`
        SELECT COUNT(*)
        FROM sp_v2_settlement_batches
        WHERE to_char(cycle_date, 'YYYY-MM-DD') = $1
      `, [batch.cycle_date_str]);

      console.log('  Trying to match to_char output:', batch.cycle_date_str);
      console.log('  Match count:', matchResult.rows[0].count);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

debugMystery().catch(console.error);
