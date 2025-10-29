#!/usr/bin/env node

const { Client } = require('pg');

const dbConfig = {
  host: '13.201.179.44',
  port: 5432,
  database: 'sp_v2_staging',
  user: 'sp_v2_user',
  password: 'sp_v2_password'
};

async function clearTestData() {
  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Clear transactions for MERCH001 on 2025-10-24
    const txnResult = await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
      AND DATE(transaction_timestamp) = '2025-10-24'
      RETURNING id
    `);
    console.log(`🗑️  Deleted ${txnResult.rowCount} PG transactions`);

    // Clear bank statements for test date
    const bankResult = await client.query(`
      DELETE FROM sp_v2_bank_statements
      WHERE source_name IN ('AXIS BANK', 'BOB', 'HDFC BANK')
      AND DATE(credited_at) = '2025-10-24'
      RETURNING id
    `);
    console.log(`🗑️  Deleted ${bankResult.rowCount} bank statements`);

    // Clear recon matches
    const reconResult = await client.query(`
      DELETE FROM sp_v2_recon_matches
      WHERE DATE(created_at) = '2025-10-24'
      RETURNING id
    `);
    console.log(`🗑️  Deleted ${reconResult.rowCount} recon matches`);

    // Clear exceptions
    const exceptionsResult = await client.query(`
      DELETE FROM sp_v2_recon_exceptions
      WHERE DATE(created_at) = '2025-10-24'
      RETURNING id
    `);
    console.log(`🗑️  Deleted ${exceptionsResult.rowCount} exceptions`);

    console.log('\n✅ Test data cleared successfully!');

  } catch (error) {
    console.error('❌ Error clearing test data:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

clearTestData();
