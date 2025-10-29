const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkReconJob() {
  try {
    // Check the actual exception metadata
    const exceptionsResult = await pool.query(`
      SELECT
        exception_type,
        reason,
        metadata
      FROM sp_v2_recon_exceptions
      WHERE DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 3
    `);

    console.log('Recent exceptions metadata:');
    console.log('-'.repeat(80));
    exceptionsResult.rows.forEach(row => {
      console.log(`Type: ${row.exception_type}`);
      console.log(`Reason: ${row.reason}`);
      console.log(`Metadata:`, JSON.stringify(row.metadata, null, 2));
      console.log();
    });

    // Check for merchant_id mismatch
    console.log('\nChecking for merchant_id issues:');
    console.log('-'.repeat(80));
    
    const pgMerchants = await pool.query(`
      SELECT DISTINCT merchant_id, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY merchant_id
    `);
    
    const bankMerchants = await pool.query(`
      SELECT DISTINCT merchant_id, COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY merchant_id
    `);
    
    console.log('PG Transactions merchant_ids:');
    pgMerchants.rows.forEach(row => {
      console.log(`  ${row.merchant_id}: ${row.count} transactions`);
    });
    
    console.log('\nBank Statements merchant_ids:');
    if (bankMerchants.rows.length === 0) {
      console.log('  ❌ NO merchant_id found in bank statements!');
      console.log('  This could be the problem - bank statements missing merchant_id');
    } else {
      bankMerchants.rows.forEach(row => {
        console.log(`  ${row.merchant_id}: ${row.count} statements`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkReconJob();
