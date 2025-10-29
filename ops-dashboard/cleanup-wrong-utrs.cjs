const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function cleanData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('======================================');
    console.log('Deleting wrong UTR records (TXN*)');
    console.log('======================================\n');

    // Delete records with wrong UTRs
    const deleteResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      AND utr LIKE 'TXN%'
      RETURNING id, utr, bank_name, amount_paise
    `);

    console.log(`✅ Deleted ${deleteResult.rowCount} records`);

    if (deleteResult.rowCount > 0 && deleteResult.rowCount <= 20) {
      console.log('\nDeleted records:');
      deleteResult.rows.forEach((row, i) => {
        console.log(`  ${i+1}. UTR: ${row.utr} | Bank: ${row.bank_name || 'UNKNOWN'} | Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      });
    }

    // Check after cleanup
    const afterCheck = await client.query(`
      SELECT COUNT(*) as count, SUM(amount_paise) as total
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log(`\nRemaining records: ${afterCheck.rows[0].count}, Total: ₹${(afterCheck.rows[0].total / 100).toFixed(2)}`);

    await client.query('COMMIT');
    console.log('\n✅ Cleanup complete!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
