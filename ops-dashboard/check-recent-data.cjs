const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function check() {
  try {
    // Check what dates have data
    console.log('=== ALL BANK STATEMENTS - DATES AND COUNTS ===');
    const bankDates = await pool.query(`
      SELECT DATE(transaction_date) as date, bank_name, COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY DATE(transaction_date), bank_name
      ORDER BY DATE(transaction_date) DESC, bank_name
      LIMIT 20
    `);
    console.log(`Found ${bankDates.rows.length} date/bank combinations:`);
    bankDates.rows.forEach(row => {
      console.log(`  Date: ${row.date}, Bank: ${row.bank_name}, Count: ${row.count}`);
    });
    
    // Check PG transaction dates
    console.log('\n=== ALL PG TRANSACTIONS - DATES AND COUNTS ===');
    const pgDates = await pool.query(`
      SELECT DATE(transaction_date) as date, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
      LIMIT 10
    `);
    console.log(`Found ${pgDates.rows.length} dates:`);
    pgDates.rows.forEach(row => {
      console.log(`  Date: ${row.date}, Count: ${row.count}`);
    });
    
    // Check most recent uploads
    console.log('\n=== MOST RECENT BANK UPLOADS ===');
    const recentBank = await pool.query(`
      SELECT bank_name, utr, bank_ref, amount_paise, transaction_date, created_at
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`Found ${recentBank.rows.length} records:`);
    recentBank.rows.forEach(row => {
      console.log(`  Created: ${row.created_at}`);
      console.log(`    Bank: ${row.bank_name}, UTR: ${row.utr}, Bank Ref: ${row.bank_ref}`);
      console.log(`    Txn Date: ${row.transaction_date}, Amount: ${row.amount_paise}`);
    });
    
    console.log('\n=== MOST RECENT PG UPLOADS ===');
    const recentPG = await pool.query(`
      SELECT transaction_id, utr, amount_paise, transaction_date, created_at
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`Found ${recentPG.rows.length} records:`);
    recentPG.rows.forEach(row => {
      console.log(`  Created: ${row.created_at}`);
      console.log(`    Txn ID: ${row.transaction_id}, UTR: ${row.utr}`);
      console.log(`    Txn Date: ${row.transaction_date}, Amount: ${row.amount_paise}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
