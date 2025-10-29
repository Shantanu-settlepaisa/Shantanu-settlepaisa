#!/usr/bin/env node
/**
 * Clear all test data for 2025-10-24 (both old TXN001-050 and new TXN101-150)
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sp_v2_staging',
  user: process.env.DB_USER || 'sp_v2_user',
  password: process.env.DB_PASSWORD || 'sp_v2_password',
});

async function clearData() {
  const client = await pool.connect();

  try {
    console.log('🧹 Clearing test data for 2025-10-24...\n');

    await client.query('BEGIN');

    // Delete recon matches first (referential integrity)
    const reconResult = await client.query(`
      DELETE FROM sp_v2_recon_matches
      WHERE created_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${reconResult.rowCount} recon matches`);

    // Delete recon exceptions
    const exceptionsResult = await client.query(`
      DELETE FROM sp_v2_recon_exceptions
      WHERE created_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${exceptionsResult.rowCount} recon exceptions`);

    // Delete bank statements
    const bankResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE credited_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${bankResult.rowCount} bank statements`);

    // Delete PG transactions
    const pgResult = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE transaction_date::date = '2025-10-24'
         OR credited_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${pgResult.rowCount} PG transactions`);

    // Delete settlement items (if any)
    const settlementItemsResult = await client.query(`
      DELETE FROM sp_v2_settlement_items
      WHERE created_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${settlementItemsResult.rowCount} settlement items`);

    // Delete settlement batches (if any)
    const settlementBatchResult = await client.query(`
      DELETE FROM sp_v2_settlement_batch
      WHERE created_at::date = '2025-10-24'
    `);
    console.log(`✅ Deleted ${settlementBatchResult.rowCount} settlement batches`);

    await client.query('COMMIT');
    console.log('\n✨ All test data cleared successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearData().catch(console.error);
