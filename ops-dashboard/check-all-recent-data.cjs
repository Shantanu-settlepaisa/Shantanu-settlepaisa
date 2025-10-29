const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123'
});

async function checkRecentData() {
  try {
    console.log('========== RECENT DATA CHECK ==========\n');

    // All transactions from last hour
    const recentTxn = await pool.query(`
      SELECT transaction_id, merchant_id, amount_paise, utr, status, source_type, created_at
      FROM sp_v2_transactions
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`📊 Recent Transactions (last hour): ${recentTxn.rows.length} found\n`);
    recentTxn.rows.forEach(row => {
      console.log(`   ${row.transaction_id} | ${row.utr || 'NO_UTR'} | ₹${(row.amount_paise / 100).toFixed(2)} | ${row.status} | ${row.created_at.toISOString()}`);
    });

    // Check total counts
    const totalCounts = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_type = 'MANUAL_UPLOAD' THEN 1 END) as manual_upload,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour
      FROM sp_v2_transactions
    `);

    console.log('\n📊 Total Counts:');
    console.log(`   Total transactions: ${totalCounts.rows[0].total}`);
    console.log(`   Manual uploads: ${totalCounts.rows[0].manual_upload}`);
    console.log(`   Last hour: ${totalCounts.rows[0].last_hour}`);

    // Bank statements
    const recentBank = await pool.query(`
      SELECT bank_ref, bank_name, utr, amount_paise, source_type, created_at
      FROM sp_v2_bank_statements
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`\n\n📊 Recent Bank Statements (last hour): ${recentBank.rows.length} found\n`);
    recentBank.rows.forEach(row => {
      console.log(`   ${row.bank_ref} | ${row.utr || 'NO_UTR'} | ₹${(row.amount_paise / 100).toFixed(2)} | ${row.bank_name} | ${row.created_at.toISOString()}`);
    });

    console.log('\n=======================================');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkRecentData();
