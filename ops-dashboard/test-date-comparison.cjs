const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testDateComparison() {
  const client = await pool.connect();

  try {
    console.log('Testing date comparison issue:');
    console.log('');

    // Test 1: Exact match (will fail)
    const test1Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-26'
    `);
    console.log('Test 1 - Exact string match (cycle_date = \'2025-10-26\'):');
    console.log('  Result:', test1Result.rows[0].count, 'rows');
    console.log('');

    // Test 2: DATE cast (should work)
    const test2Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-26'
    `);
    console.log('Test 2 - DATE cast (DATE(cycle_date) = \'2025-10-26\'):');
    console.log('  Result:', test2Result.rows[0].count, 'rows');
    console.log('');

    // Test 3: Get actual values to see the difference
    const test3Result = await client.query(`
      SELECT
        cycle_date,
        DATE(cycle_date) as cycle_date_only,
        cycle_date::text as cycle_date_text
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
      LIMIT 3
    `);
    console.log('Test 3 - Actual cycle_date values:');
    test3Result.rows.forEach((row) => {
      console.log('  Raw:', row.cycle_date);
      console.log('  DATE():', row.cycle_date_only);
      console.log('  ::text:', row.cycle_date_text);
      console.log('');
    });

    // Test 4: Try the fixed query
    const test4Result = await client.query(`
      SELECT
        t.transaction_id,
        si.amount_paise,
        sb.cycle_date
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE DATE(sb.cycle_date) = $1
        AND sb.merchant_id = $2
      LIMIT 5
    `, ['2025-10-26', 'MERCH001']);

    console.log('Test 4 - Fixed query with DATE() cast:');
    console.log('  Result:', test4Result.rows.length, 'rows');
    if (test4Result.rows.length > 0) {
      console.log('  ✅ SUCCESS! Query now returns data.');
      test4Result.rows.forEach((row) => {
        console.log('    -', row.transaction_id, '₹' + (row.amount_paise / 100).toFixed(2));
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

testDateComparison().catch(console.error);
