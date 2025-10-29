const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkAllData() {
  try {
    console.log('🔍 CHECKING ALL DATA FOR OCT 28:\n');

    // Check ALL PG transactions
    const allPg = await pool.query(`
      SELECT
        transaction_id,
        merchant_id,
        amount_paise / 100.0 as amount,
        status,
        created_at::timestamp
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
    `);

    console.log(`📊 PG Transactions (${allPg.rows.length} total):`);
    console.log('-'.repeat(80));
    allPg.rows.forEach(row => {
      console.log(`${row.transaction_id} | ₹${row.amount} | ${row.status} | ${row.created_at}`);
    });

    const pgTotal = allPg.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    console.log(`\nPG Total: ₹${pgTotal}`);

    // Check ALL Bank statements
    const allBank = await pool.query(`
      SELECT
        utr,
        amount_paise / 100.0 as amount,
        bank_name,
        created_at::timestamp
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
    `);

    console.log(`\n\n🏦 Bank Statements (${allBank.rows.length} total):`);
    console.log('-'.repeat(80));
    allBank.rows.forEach(row => {
      console.log(`${row.utr} | ₹${row.amount} | ${row.bank_name} | ${row.created_at}`);
    });

    const bankTotal = allBank.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    console.log(`\nBank Total: ₹${bankTotal}`);

    // Check if there are DUPLICATE uploads
    if (allPg.rows.length !== 10 || allBank.rows.length !== 10) {
      console.log('\n\n⚠️ WARNING: Expected 10 records each, but found different counts!');
      console.log('There might be duplicate uploads or old test data.');
    }

    // Check upload sessions to see how many times files were uploaded
    const sessions = await pool.query(`
      SELECT
        session_id,
        file_type,
        records_inserted,
        status,
        created_at::timestamp
      FROM sp_v2_upload_sessions
      WHERE DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log(`\n\n📤 Upload Sessions Today (${sessions.rows.length} total):`);
    console.log('-'.repeat(80));
    sessions.rows.forEach(row => {
      console.log(`${row.file_type} | ${row.records_inserted} records | ${row.status} | ${row.created_at}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAllData();
