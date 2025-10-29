const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

async function checkDates() {
  const result = await pool.query(`
    SELECT
      transaction_date::text,
      COUNT(*) as count
    FROM sp_v2_transactions
    WHERE merchant_id = 'MERCH001'
    GROUP BY transaction_date
    ORDER BY transaction_date
  `);

  console.log('Transaction Date Distribution:');
  result.rows.forEach(row => {
    console.log(`  ${row.transaction_date}: ${row.count} transactions`);
  });

  // Check first few to see the timestamp issue
  const sample = await pool.query(`
    SELECT transaction_id, transaction_timestamp, transaction_date
    FROM sp_v2_transactions
    WHERE merchant_id = 'MERCH001'
    ORDER BY transaction_id
    LIMIT 5
  `);

  console.log('\nSample Transactions:');
  sample.rows.forEach(row => {
    console.log(`  ${row.transaction_id}: ${row.transaction_timestamp} → ${row.transaction_date}`);
  });

  await pool.end();
}

checkDates();
