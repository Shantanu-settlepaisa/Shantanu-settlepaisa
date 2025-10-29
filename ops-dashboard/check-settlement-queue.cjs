const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  console.log('\n1. Checking if trigger exists:');
  const trigger = await pool.query(`
    SELECT * FROM pg_trigger 
    WHERE tgname = 'trg_transaction_status_change'
  `);
  console.log('   Trigger installed:', trigger.rows.length > 0 ? 'YES ✓' : 'NO ✗');

  console.log('\n2. Checking settlement_queue table:');
  try {
    const queue = await pool.query(`
      SELECT * FROM sp_v2_settlement_queue 
      WHERE transaction_id LIKE 'TXN202510%'
      ORDER BY queued_at DESC LIMIT 10
    `);
    console.log('   Queue entries:', queue.rows.length);
    if (queue.rows.length > 0) {
      console.log('   Sample:', queue.rows[0]);
    }
  } catch (e) {
    console.log('   ERROR:', e.message);
  }

  console.log('\n3. Checking settlement_batches:');
  try {
    const batches = await pool.query(`
      SELECT * FROM sp_v2_settlement_batches 
      WHERE merchant_id = 'MERCH001'
      ORDER BY created_at DESC LIMIT 5
    `);
    console.log('   Batches:', batches.rows.length);
  } catch (e) {
    console.log('   ERROR:', e.message);
  }

  console.log('\n4. Checking RECONCILED transactions:');
  const reconciled = await pool.query(`
    SELECT transaction_id, status, merchant_id, amount_paise, updated_at
    FROM sp_v2_transactions 
    WHERE transaction_id LIKE 'TXN202510%' AND status = 'RECONCILED'
    ORDER BY updated_at DESC
  `);
  console.log('   RECONCILED transactions:', reconciled.rows.length);
  if (reconciled.rows.length > 0) {
    console.log('   Sample:', reconciled.rows[0]);
  }

  await pool.end();
})();
