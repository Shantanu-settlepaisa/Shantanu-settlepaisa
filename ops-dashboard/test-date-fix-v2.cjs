const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testDateFixV2() {
  const client = await pool.connect();

  try {
    console.log('Testing different date filtering approaches:');
    console.log('');

    // Approach 1: Cast both sides to date
    const test1Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE cycle_date::date = '2025-10-26'::date
    `);
    console.log('Approach 1 - cycle_date::date = \'2025-10-26\'::date:');
    console.log('  Result:', test1Result.rows[0].count, 'rows');
    console.log('');

    // Approach 2: Use date range
    const test2Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE cycle_date >= '2025-10-26'::date
        AND cycle_date < '2025-10-27'::date
    `);
    console.log('Approach 2 - Date range (>= 2025-10-26 AND < 2025-10-27):');
    console.log('  Result:', test2Result.rows[0].count, 'rows');
    console.log('');

    // Approach 3: Use AT TIME ZONE
    const test3Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE (cycle_date AT TIME ZONE 'UTC')::date = '2025-10-26'::date
    `);
    console.log('Approach 3 - (cycle_date AT TIME ZONE \'UTC\')::date = \'2025-10-26\':');
    console.log('  Result:', test3Result.rows[0].count, 'rows');
    console.log('');

    // Approach 4: Just check without merchant filter
    const test4Result = await client.query(`
      SELECT
        cycle_date,
        cycle_date::date as date_part,
        merchant_id
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
      LIMIT 3
    `);
    console.log('Approach 4 - Show actual values:');
    test4Result.rows.forEach((row) => {
      console.log('  cycle_date:', row.cycle_date);
      console.log('  ::date:', row.date_part);
      console.log('  merchant:', row.merchant_id);
      console.log('');
    });

    // Try the working query
    const workingResult = await client.query(`
      SELECT
        t.transaction_id,
        si.amount_paise,
        sb.cycle_date,
        sb.cycle_date::date as cycle_date_only
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE sb.merchant_id = 'MERCH001'
      LIMIT 5
    `);

    console.log('Query without cycle_date filter:');
    console.log('  Result:', workingResult.rows.length, 'rows');
    if (workingResult.rows.length > 0) {
      workingResult.rows.forEach((row) => {
        console.log('   ', row.transaction_id, '| cycle:', row.cycle_date, '| date:', row.cycle_date_only);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testDateFixV2().catch(console.error);
