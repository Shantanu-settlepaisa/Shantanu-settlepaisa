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

    console.log('=========================================');
    console.log('Cleaning Duplicate Bank Data for 2025-10-27');
    console.log('=========================================\n');

    // Check current state
    const beforeCheck = await client.query(`
      SELECT
        bank_name,
        COUNT(*) as count,
        SUM(amount_paise) as total_amount,
        COUNT(CASE WHEN utr LIKE 'TXN%' THEN 1 END) as wrong_utrs,
        COUNT(CASE WHEN utr LIKE 'AXIS%' THEN 1 END) as correct_utrs
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
    `);

    console.log('BEFORE cleanup:');
    beforeCheck.rows.forEach(row => {
      console.log(`  ${row.bank_name}:`);
      console.log(`    Total: ${row.count} records, ₹${(row.total_amount / 100).toFixed(2)}`);
      console.log(`    Wrong UTRs (TXN*): ${row.wrong_utrs}`);
      console.log(`    Correct UTRs (AXIS*): ${row.correct_utrs}`);
    });

    // Delete records with wrong UTRs
    const deleteResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      AND bank_name = 'HDFC BANK'
      AND utr LIKE 'TXN%'
      RETURNING id, utr, amount_paise
    `);

    console.log(`\n✅ Deleted ${deleteResult.rowCount} records with wrong UTRs`);

    if (deleteResult.rowCount > 0 && deleteResult.rowCount <= 5) {
      console.log('\nDeleted records:');
      deleteResult.rows.forEach((row, i) => {
        console.log(`  ${i+1}. UTR: ${row.utr} | Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      });
    }

    // Check after cleanup
    const afterCheck = await client.query(`
      SELECT bank_name, COUNT(*) as count, SUM(amount_paise) as total_amount
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
    `);

    console.log('\nAFTER cleanup:');
    afterCheck.rows.forEach(row => {
      console.log(`  ${row.bank_name}: ${row.count} records, ₹${(row.total_amount / 100).toFixed(2)}`);
    });

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

cleanData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
