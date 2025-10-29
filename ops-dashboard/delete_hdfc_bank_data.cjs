const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function deleteBankData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('========================================');
    console.log('Deleting HDFC BANK records for 2025-10-27');
    console.log('========================================\n');

    // Check what we're about to delete
    const checkResult = await client.query(`
      SELECT bank_name, COUNT(*) as count, SUM(amount_paise) as total_amount
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
    `);

    console.log('Current bank data for 2025-10-27:');
    checkResult.rows.forEach(row => {
      console.log(`  ${row.bank_name}: ${row.count} records, ₹${(row.total_amount / 100).toFixed(2)}`);
    });

    // Delete only HDFC records
    const deleteResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      AND bank_name = 'HDFC BANK'
      RETURNING id, bank_name, utr, amount_paise
    `);

    console.log(`\n✅ Deleted ${deleteResult.rowCount} HDFC BANK records`);
    
    if (deleteResult.rowCount > 0) {
      console.log('\nFirst 5 deleted records:');
      deleteResult.rows.slice(0, 5).forEach((row, i) => {
        console.log(`  ${i+1}. ${row.bank_name} | UTR: ${row.utr} | ₹${(row.amount_paise / 100).toFixed(2)}`);
      });
    }

    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

deleteBankData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
