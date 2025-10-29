const { Pool } = require('pg');
require('dotenv').config({ path: './services/overview-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function clearOct28Data() {
  const client = await pool.connect();

  try {
    console.log('Clearing Oct 28, 2025 test data...\n');

    await client.query('BEGIN');

    // Clear PG transactions
    const pgResult = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-28'
      AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✅ Deleted ${pgResult.rowCount} PG transactions`);

    // Clear bank statements
    const bankResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`✅ Deleted ${bankResult.rowCount} bank statements`);

    // Clear reconciliation results if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_reconciliation_results'
      );
    `);

    if (tableCheck.rows[0].exists) {
      const reconResult = await client.query(`
        DELETE FROM sp_v2_reconciliation_results
        WHERE job_id IN (
          SELECT DISTINCT rr.job_id
          FROM sp_v2_reconciliation_results rr
          WHERE rr.pg_transaction_id IN (
            SELECT transaction_id
            FROM sp_v2_transactions
            WHERE DATE(transaction_date) = '2025-10-28'
            AND source_type = 'MANUAL_UPLOAD'
          )
        )
      `);
      console.log(`✅ Deleted ${reconResult.rowCount} reconciliation results`);
    }

    await client.query('COMMIT');
    console.log('\n✅ All Oct 28 test data cleared successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

clearOct28Data();
