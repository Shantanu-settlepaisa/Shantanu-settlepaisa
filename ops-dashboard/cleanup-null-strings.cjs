#!/usr/bin/env node
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'SettlePaisa2024',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function cleanupNullStrings() {
  console.log('🧹 Cleaning up string "null" values in staging database...\n');

  try {
    // Check for problematic records first
    console.log('📊 Checking for records with string "null" values...');

    const checkRefunds = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE refund_amount_paise::text = 'null'
    `);
    console.log(`   Found ${checkRefunds.rows[0].count} refund records with string "null"`);

    const checkChargebacks = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE chargeback_amount_paise::text = 'null'
    `);
    console.log(`   Found ${checkChargebacks.rows[0].count} chargeback records with string "null"`);

    // Clean up refund_amount_paise
    console.log('\n🔧 Fixing refund_amount_paise...');
    const refundResult = await pool.query(`
      UPDATE sp_v2_transactions
      SET refund_amount_paise = NULL
      WHERE refund_amount_paise::text = 'null'
      RETURNING transaction_id
    `);
    console.log(`   ✅ Fixed ${refundResult.rowCount} records`);

    // Clean up chargeback_amount_paise
    console.log('\n🔧 Fixing chargeback_amount_paise...');
    const chargebackResult = await pool.query(`
      UPDATE sp_v2_transactions
      SET chargeback_amount_paise = NULL
      WHERE chargeback_amount_paise::text = 'null'
      RETURNING transaction_id
    `);
    console.log(`   ✅ Fixed ${chargebackResult.rowCount} records`);

    // Verify cleanup
    console.log('\n✅ Verifying cleanup...');
    const verifyRefunds = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE refund_amount_paise::text = 'null'
    `);
    console.log(`   Remaining refund "null" strings: ${verifyRefunds.rows[0].count}`);

    const verifyChargebacks = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE chargeback_amount_paise::text = 'null'
    `);
    console.log(`   Remaining chargeback "null" strings: ${verifyChargebacks.rows[0].count}`);

    console.log('\n🎉 Database cleanup completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

cleanupNullStrings().catch(console.error);
