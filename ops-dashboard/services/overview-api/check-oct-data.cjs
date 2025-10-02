const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function check() {
  // Check Oct 1 data
  const oct1 = await pool.query(`
    SELECT transaction_date, COUNT(*) as count
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-10-01'
    GROUP BY transaction_date
    ORDER BY transaction_date
  `);
  
  console.log('Oct 1+ data:', oct1.rows);
  
  // Check last few days of Sept
  const lastDays = await pool.query(`
    SELECT transaction_date, COUNT(*) as count, status
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-09-28'
    GROUP BY transaction_date, status
    ORDER BY transaction_date, status
  `);
  
  console.log('\nLast days of Sept + Oct:', lastDays.rows);
  
  await pool.end();
}

check();
