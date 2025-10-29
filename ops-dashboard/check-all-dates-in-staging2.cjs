const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function checkAllDates() {
  const client = await pool.connect();
  try {
    console.log('========================================');
    console.log('All Transaction Dates in Staging 2 RDS');
    console.log('========================================\n');

    // Get all transactions grouped by date
    const byDate = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise,
        string_agg(DISTINCT status, ', ') as statuses,
        string_agg(DISTINCT source_type, ', ') as sources
      FROM sp_v2_transactions
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    console.log('TRANSACTIONS BY DATE:');
    byDate.rows.forEach(row => {
      console.log(`\n  ${row.txn_date}:`);
      console.log(`    Count: ${row.count}`);
      console.log(`    Total: ₹${(row.total_paise / 100).toFixed(2)}`);
      console.log(`    Statuses: ${row.statuses}`);
      console.log(`    Sources: ${row.sources}`);
    });

    // Total summary
    const total = await client.query(`
      SELECT
        COUNT(*) as total_count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_transactions
    `);

    console.log('\n========================================');
    console.log('TOTAL ACROSS ALL DATES:');
    console.log(`  Transactions: ${total.rows[0].total_count}`);
    console.log(`  Amount: ₹${(total.rows[0].total_paise / 100).toFixed(2)}`);
    console.log('========================================\n');

    // Check bank statements
    console.log('BANK STATEMENTS BY DATE:');
    const bankByDate = await client.query(`
      SELECT
        DATE(transaction_date) as txn_date,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
    `);

    bankByDate.rows.forEach(row => {
      console.log(`  ${row.txn_date}: ${row.count} records, ₹${(row.total_paise / 100).toFixed(2)}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkAllDates().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
