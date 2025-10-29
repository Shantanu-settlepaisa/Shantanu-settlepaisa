#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkData() {
  const client = await pool.connect();

  try {
    // Check schema
    console.log('📋 sp_v2_transactions columns:');
    const schemaResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_transactions'
      ORDER BY ordinal_position
      LIMIT 20
    `);
    schemaResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    // Check recent transactions
    console.log('\n📊 Recent transactions:');
    const txnResult = await client.query(`
      SELECT transaction_id, merchant_id, amount_paise, utr, source_type, created_at
      FROM sp_v2_transactions
      ORDER BY created_at DESC
      LIMIT 10
    `);
    txnResult.rows.forEach(row => {
      console.log(`  ${row.transaction_id} (${row.merchant_id}): ₹${(row.amount_paise/100).toFixed(2)}, UTR: ${row.utr}, Source: ${row.source_type}`);
    });

    // Check bank statements
    console.log('\n📊 Recent bank statements:');
    const bankResult = await client.query(`
      SELECT bank_ref, amount_paise, utr, source_type, created_at
      FROM sp_v2_bank_statements
      ORDER BY created_at DESC
      LIMIT 10
    `);
    bankResult.rows.forEach(row => {
      console.log(`  ${row.bank_ref}: ₹${(row.amount_paise/100).toFixed(2)}, UTR: ${row.utr}, Source: ${row.source_type}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkData();
