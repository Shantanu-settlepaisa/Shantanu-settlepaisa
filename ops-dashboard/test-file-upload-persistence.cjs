const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function testFileUploadPersistence() {
  console.log('=== TESTING FILE UPLOAD → DATABASE PERSISTENCE ===\n');
  
  // Step 1: Check current state
  console.log('Step 1: Current database state');
  const before = await pool.query('SELECT COUNT(*) FROM sp_v2_transactions');
  console.log(`Transactions before: ${before.rows[0].count}`);
  
  // Step 2: Load test CSV data
  console.log('\nStep 2: Loading test CSV data');
  const pgCsvContent = fs.readFileSync('test_pg_transactions.csv', 'utf-8');
  const pgLines = pgCsvContent.split('\n').filter(l => l.trim());
  const pgHeaders = pgLines[0].split(',');
  const pgData = pgLines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    pgHeaders.forEach((header, idx) => {
      row[header] = values[idx];
    });
    return row;
  });
  
  console.log(`Loaded ${pgData.length} PG transactions from CSV`);
  console.log('Sample:', JSON.stringify(pgData[0], null, 2));
  
  // Step 3: Simulate what SHOULD happen on upload
  console.log('\nStep 3: Inserting CSV data into sp_v2_transactions table');
  
  let inserted = 0;
  for (const row of pgData) {
    try {
      await pool.query(`
        INSERT INTO sp_v2_transactions (
          transaction_id,
          merchant_id,
          amount_paise,
          currency,
          transaction_date,
          transaction_timestamp,
          source_type,
          source_name,
          payment_method,
          utr,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (transaction_id) DO NOTHING
      `, [
        row.pg_txn_id,
        row.merchant_id,
        parseInt(row.amount_paise),
        'INR',
        row.created_at.split('T')[0],
        row.created_at,
        'MANUAL_UPLOAD',
        'test_pg_transactions.csv',
        row.payment_method,
        row.utr,
        row.status
      ]);
      inserted++;
    } catch (error) {
      console.error(`Failed to insert ${row.pg_txn_id}:`, error.message);
    }
  }
  
  console.log(`✅ Inserted ${inserted} transactions`);
  
  // Step 4: Verify
  console.log('\nStep 4: Verifying database state');
  const after = await pool.query('SELECT COUNT(*) FROM sp_v2_transactions');
  console.log(`Transactions after: ${after.rows[0].count}`);
  console.log(`New transactions added: ${after.rows[0].count - before.rows[0].count}`);
  
  // Step 5: Show the data
  console.log('\nStep 5: Showing uploaded transactions');
  const uploaded = await pool.query(`
    SELECT 
      transaction_id,
      merchant_id,
      amount_paise/100 as amount_rupees,
      payment_method,
      utr,
      source_name,
      created_at
    FROM sp_v2_transactions
    WHERE source_name = 'test_pg_transactions.csv'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  
  console.table(uploaded.rows);
  
  await pool.end();
  
  console.log('\n=== ANSWER TO YOUR QUESTION ===');
  console.log('Once file gets uploaded, entries SHOULD be in sp_v2_transactions table.');
  console.log('Currently: Recon API has MOCK persistence (line 494-497 in runReconciliation.js)');
  console.log('');
  console.log('WHAT NEEDS TO BE DONE:');
  console.log('1. Replace mock persistResults() with actual INSERT statements');
  console.log('2. Insert PG transactions into sp_v2_transactions');
  console.log('3. Insert bank records into sp_v2_bank_statements (if table exists)');
  console.log('4. Insert matches into sp_v2_recon_matches');
  console.log('');
  console.log('This test shows the data CAN be inserted. Just need to wire it up.');
}

testFileUploadPersistence().catch(console.error);
