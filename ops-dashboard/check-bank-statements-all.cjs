const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkBankStatements() {
  try {
    console.log('🔍 CHECKING ALL BANK STATEMENTS:\n');

    // Check all bank statements in the table
    const all = await pool.query(`
      SELECT
        utr,
        amount_paise / 100.0 as amount,
        gross_amount_paise / 100.0 as gross_amount,
        bank_name,
        transaction_date,
        source_type,
        created_at::date as upload_date
      FROM sp_v2_bank_statements
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log(`Total rows in sp_v2_bank_statements: ${all.rows.length}`);
    console.log('-'.repeat(80));
    
    if (all.rows.length === 0) {
      console.log('❌ NO BANK STATEMENTS AT ALL IN THE TABLE!');
      console.log('   The bank file upload is completely failing.');
    } else {
      console.log('Recent bank statements:');
      all.rows.forEach(row => {
        console.log(`${row.transaction_date} | ${row.utr} | ₹${row.amount} | ${row.bank_name} | ${row.source_type} | Uploaded: ${row.upload_date}`);
      });

      // Check specifically for Oct 28
      const oct28 = await pool.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_bank_statements
        WHERE DATE(transaction_date) = '2025-10-28'
      `);

      console.log(`\nOct 28 bank statements: ${oct28.rows[0].count}`);
    }

    // Check for today's uploads
    const today = await pool.query(`
      SELECT
        utr,
        amount_paise / 100.0 as amount,
        transaction_date,
        bank_name,
        source_type,
        created_at::timestamp
      FROM sp_v2_bank_statements
      WHERE DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
    `);

    console.log(`\n📅 Bank statements uploaded TODAY: ${today.rows.length}`);
    if (today.rows.length > 0) {
      console.log('-'.repeat(80));
      today.rows.forEach(row => {
        console.log(`${row.utr} | ₹${row.amount} | ${row.transaction_date} | ${row.created_at}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBankStatements();
