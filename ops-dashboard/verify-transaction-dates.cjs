#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function verifyDates() {
  try {
    console.log('📅 Checking Transaction Dates in Database\n');

    // Check PG transactions
    const pgDates = await pool.query(`
      SELECT 
        MIN(transaction_date) as min_date,
        MAX(transaction_date) as max_date,
        COUNT(*) as total_count
      FROM sp_v2_transactions
      WHERE source_type = 'PG'
    `);
    
    console.log('PG Transactions:');
    console.log(`  Count: ${pgDates.rows[0].total_count}`);
    console.log(`  Date Range: ${pgDates.rows[0].min_date} to ${pgDates.rows[0].max_date}\n`);

    // Check Bank statements by source
    const bankDates = await pool.query(`
      SELECT 
        bank_name,
        source_type,
        MIN(transaction_date) as min_txn_date,
        MAX(transaction_date) as max_txn_date,
        MIN(value_date) as min_val_date,
        MAX(value_date) as max_val_date,
        COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name, source_type
      ORDER BY bank_name
    `);

    console.log('Bank Statements:');
    bankDates.rows.forEach(row => {
      console.log(`\n  ${row.bank_name}:`);
      console.log(`    Count: ${row.count}`);
      console.log(`    Transaction Date Range: ${row.min_txn_date} to ${row.max_txn_date}`);
      console.log(`    Value Date Range: ${row.min_val_date} to ${row.max_val_date}`);
    });

    // Check sample UTRs from each bank
    console.log('\n\n📋 Sample UTRs from each bank:');
    const samples = await pool.query(`
      SELECT bank_name, utr, transaction_date, value_date
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      ORDER BY bank_name, utr
      LIMIT 15
    `);
    
    samples.rows.forEach(row => {
      console.log(`  ${row.bank_name}: UTR=${row.utr}, txn_date=${row.transaction_date}, val_date=${row.value_date}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyDates();
