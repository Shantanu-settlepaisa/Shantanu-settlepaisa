const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugUpload() {
  try {
    console.log('=== Checking Oct 28 Uploaded Data ===\n');

    // Check PG transactions
    const pgResult = await pool.query(`
      SELECT
        transaction_id,
        utr,
        paid_amount_paise / 100.0 as amount,
        status,
        transaction_date::date
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY transaction_id
    `);

    console.log(`\n📊 PG Transactions (${pgResult.rows.length} found):`);
    console.log('─'.repeat(80));
    pgResult.rows.forEach(row => {
      console.log(`${row.transaction_id} | UTR: ${row.utr} | ₹${row.amount} | ${row.status}`);
    });

    // Check Bank statements
    const bankResult = await pool.query(`
      SELECT
        utr,
        paid_amount_paise / 100.0 as amount,
        bank_name,
        status,
        transaction_date::date
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY utr
    `);

    console.log(`\n\n🏦 Bank Statements (${bankResult.rows.length} found):`);
    console.log('─'.repeat(80));
    bankResult.rows.forEach(row => {
      console.log(`UTR: ${row.utr} | ₹${row.amount} | ${row.bank_name} | ${row.status}`);
    });

    // Check for exceptions
    const exceptionsResult = await pool.query(`
      SELECT
        exception_type,
        reason,
        COUNT(*) as count
      FROM sp_v2_recon_exceptions
      WHERE merchant_id = 'MERCH001'
        AND DATE(created_at) = '2025-10-28'
      GROUP BY exception_type, reason
      ORDER BY count DESC
    `);

    console.log(`\n\n⚠️  Exceptions (${exceptionsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0)} total):`);
    console.log('─'.repeat(80));
    exceptionsResult.rows.forEach(row => {
      console.log(`${row.exception_type}: ${row.reason} (${row.count} occurrences)`);
    });

    // Check totals
    const pgTotal = pgResult.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
    const bankTotal = bankResult.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

    console.log('\n\n💰 Amount Summary:');
    console.log('─'.repeat(80));
    console.log(`PG Total:   ₹${pgTotal.toLocaleString('en-IN')}`);
    console.log(`Bank Total: ₹${bankTotal.toLocaleString('en-IN')}`);
    console.log(`Expected:   ₹2,20,000`);

    // Check merchant config
    const merchantResult = await pool.query(`
      SELECT merchant_id, merchant_name, is_active
      FROM sp_v2_merchant_configs
      WHERE merchant_id = 'MERCH001'
    `);

    console.log('\n\n🏪 Merchant Config:');
    console.log('─'.repeat(80));
    if (merchantResult.rows.length > 0) {
      console.log(`✅ MERCH001 found: ${merchantResult.rows[0].merchant_name} (Active: ${merchantResult.rows[0].is_active})`);
    } else {
      console.log('❌ MERCH001 NOT FOUND in merchant_configs!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugUpload();
