const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Sabpaisa@2024'
});

async function clearOct28Data() {
  const client = await pool.connect();

  try {
    console.log('🗑️  Clearing October 28 reconciliation data...');

    // Delete reconciliation results for Oct 28
    const deleteReconResults = await client.query(`
      DELETE FROM sp_v2_reconciliation_results
      WHERE DATE(created_at) = '2025-10-28'
      RETURNING job_id
    `);

    console.log('✅ Deleted', deleteReconResults.rowCount, 'reconciliation result records');

    // Optional: Delete the PG transactions and bank statements too
    const deletePgTxns = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-28'
      AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log('✅ Deleted', deletePgTxns.rowCount, 'PG transaction records');

    const deleteBankStmts = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log('✅ Deleted', deleteBankStmts.rowCount, 'bank statement records');

    console.log('\n✅ October 28 test data cleared successfully!');
    console.log('You can now re-upload the test files and run reconciliation again.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearOct28Data().catch(console.error);
