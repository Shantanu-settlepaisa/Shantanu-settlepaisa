#!/usr/bin/env node

const { Pool } = require('pg');

async function cleanup() {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('Deleting PG transactions for 2025-10-10...');

    const deleteResult = await pool.query(`
      DELETE FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-10'
    `);

    console.log(`✅ Deleted ${deleteResult.rowCount} PG transactions`);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-10'
    `);

    console.log(`Remaining PG transactions for 2025-10-10: ${countResult.rows[0].count}`);

    await pool.end();
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

cleanup();
