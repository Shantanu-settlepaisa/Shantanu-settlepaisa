const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testDateFixV3() {
  const client = await pool.connect();

  try {
    console.log('Final date fix attempts:');
    console.log('');

    // Try comparing timestamps directly
    const test1Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-26T18:30:00.000Z'::timestamp
    `);
    console.log('Test 1 - Exact timestamp match:');
    console.log('  Result:', test1Result.rows[0].count, 'rows');
    console.log('');

    // Try using to_char
    const test2Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE to_char(cycle_date, 'YYYY-MM-DD') = '2025-10-26'
    `);
    console.log('Test 2 - to_char(cycle_date, \'YYYY-MM-DD\') = \'2025-10-26\':');
    console.log('  Result:', test2Result.rows[0].count, 'rows');
    console.log('');

    // Try date_trunc
    const test3Result = await client.query(`
      SELECT COUNT(*)
      FROM sp_v2_settlement_batches
      WHERE date_trunc('day', cycle_date) = '2025-10-26'::timestamp
    `);
    console.log('Test 3 - date_trunc(\'day\', cycle_date) = \'2025-10-26\':');
    console.log('  Result:', test3Result.rows[0].count, 'rows');
    console.log('');

    // Now test the full query with the working approach
    let bestApproach = '';
    if (test2Result.rows[0].count > 0) {
      bestApproach = 'to_char';
      console.log('✅ Best approach: to_char()');
    } else if (test3Result.rows[0].count > 0) {
      bestApproach = 'date_trunc';
      console.log('✅ Best approach: date_trunc()');
    }

    if (bestApproach) {
      const whereClause = bestApproach === 'to_char'
        ? `to_char(sb.cycle_date, 'YYYY-MM-DD') = $1`
        : `date_trunc('day', sb.cycle_date) = $1::timestamp`;

      const finalResult = await client.query(`
        SELECT
          t.transaction_id,
          si.amount_paise,
          sb.cycle_date
        FROM sp_v2_transactions t
        INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
        JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
        WHERE ${whereClause}
          AND sb.merchant_id = $2
        LIMIT 5
      `, ['2025-10-26', 'MERCH001']);

      console.log('');
      console.log('Final query result:');
      console.log('  Rows:', finalResult.rows.length);
      if (finalResult.rows.length > 0) {
        console.log('  ✅ SUCCESS! Found transaction data.');
        finalResult.rows.forEach((row) => {
          console.log('   ', row.transaction_id, '- ₹' + (row.amount_paise / 100).toFixed(2));
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testDateFixV3().catch(console.error);
