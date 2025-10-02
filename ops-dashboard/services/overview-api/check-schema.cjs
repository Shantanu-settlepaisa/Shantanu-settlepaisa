const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function check() {
  // Check actual values
  const sample = await pool.query(`
    SELECT transaction_id, transaction_date, transaction_timestamp
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-09-30'
    LIMIT 5
  `);
  
  console.log('Sample records:');
  sample.rows.forEach(r => {
    console.log(`  ID: ${r.transaction_id}`);
    console.log(`  Date: ${r.transaction_date} (type: ${typeof r.transaction_date})`);
    console.log(`  Timestamp: ${r.transaction_timestamp}`);
    console.log('');
  });
  
  await pool.end();
}

check();
