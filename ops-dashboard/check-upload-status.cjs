const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123'
});

async function checkUploadStatus() {
  try {
    console.log('==========  UPLOAD VERIFICATION ==========\n');

    // Check sp_v2_transactions
    const txnResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        source_type
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%' OR transaction_id LIKE 'BANK%'
      GROUP BY source_type
    `);

    console.log('📊 sp_v2_transactions:');
    if (txnResult.rows.length > 0) {
      txnResult.rows.forEach(row => {
        console.log(`   ${row.source_type}: ${row.count} rows`);
      });
    } else {
      console.log('   No E2E test transactions found');
    }

    // Sample transactions
    const sampleTxn = await pool.query(`
      SELECT transaction_id, merchant_id, amount_paise, utr, status, source_type
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%' OR transaction_id LIKE 'BANK%'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('\n📋 Sample Transactions:');
    sampleTxn.rows.forEach(row => {
      console.log(`   ${row.transaction_id} | ${row.utr} | ₹${(row.amount_paise / 100).toFixed(2)} | ${row.status}`);
    });

    // Check sp_v2_bank_statements
    const bankResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        source_type
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'UTR_E2E%' OR utr LIKE 'UTR_BANK%'
      GROUP BY source_type
    `);

    console.log('\n\n📊 sp_v2_bank_statements:');
    if (bankResult.rows.length > 0) {
      bankResult.rows.forEach(row => {
        console.log(`   ${row.source_type}: ${row.count} rows`);
      });
    } else {
      console.log('   No E2E test bank statements found');
    }

    // Sample bank statements
    const sampleBank = await pool.query(`
      SELECT bank_ref, bank_name, utr, amount_paise, source_type
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'UTR_E2E%' OR utr LIKE 'UTR_BANK%'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('\n📋 Sample Bank Statements:');
    if (sampleBank.rows.length > 0) {
      sampleBank.rows.forEach(row => {
        console.log(`   ${row.bank_ref} | ${row.utr} | ₹${(row.amount_paise / 100).toFixed(2)} | ${row.bank_name}`);
      });
    } else {
      console.log('   No bank statements found');
    }

    console.log('\n===========================================');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUploadStatus();
