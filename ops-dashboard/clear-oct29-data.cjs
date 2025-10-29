const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

(async () => {
  try {
    // Delete Oct 29 data
    const result1 = await pool.query("DELETE FROM sp_v2_transactions WHERE DATE(transaction_date) = '2025-10-29'");
    const result2 = await pool.query("DELETE FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29'");

    console.log('✅ Deleted', result1.rowCount, 'PG transactions');
    console.log('✅ Deleted', result2.rowCount, 'bank statements');

    // Verify clean slate
    const verify = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sp_v2_transactions WHERE DATE(transaction_date) = '2025-10-29') as pg_count,
        (SELECT COUNT(*) FROM sp_v2_bank_statements WHERE DATE(transaction_date) = '2025-10-29') as bank_count
    `);

    console.log('\nVerification:', verify.rows[0]);

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
})();
