const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function test() {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(amount_paise) as total_amount,
      SUM(amount_paise) FILTER (WHERE status = 'RECONCILED') as reconciled_amount,
      SUM(amount_paise) FILTER (WHERE status = 'EXCEPTION') as exception_amount
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-09-28' AND transaction_date <= '2025-09-30'
  `);
  
  console.log('Query result:', result.rows[0]);
  await pool.end();
}

test();
