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
    console.log('Deleting bad bank data for 2025-10-10...');

    const deleteResult = await pool.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE transaction_date = '2025-10-10'
    `);

    console.log(`✅ Deleted ${deleteResult.rowCount} bank statements`);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM sp_v2_bank_statements
      WHERE transaction_date = '2025-10-10'
    `);

    console.log(`Remaining bank statements for 2025-10-10: ${countResult.rows[0].count}`);

    await pool.end();
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

cleanup();
