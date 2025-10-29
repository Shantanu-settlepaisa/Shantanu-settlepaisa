const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugJoin() {
  const client = await pool.connect();

  try {
    const batchId = '66103ed1-e0c4-4b0b-b2ea-b246409972f5';

    console.log('🔍 Debugging Settlement Reports Join Issue');
    console.log('===========================================');
    console.log('');

    // Check settlement items
    const itemsResult = await client.query(`
      SELECT
        transaction_id,
        amount_paise,
        settlement_batch_id
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
      LIMIT 5
    `, [batchId]);

    console.log('1️⃣  Settlement Items (sample 5):');
    itemsResult.rows.forEach((item) => {
      console.log('   Transaction ID:', item.transaction_id);
    });
    console.log('   Total items:', itemsResult.rows.length);
    console.log('');

    // Check if these transaction_ids exist in sp_v2_transactions
    const txnIds = itemsResult.rows.map(r => r.transaction_id);
    const txnsResult = await client.query(`
      SELECT transaction_id
      FROM sp_v2_transactions
      WHERE transaction_id = ANY($1::text[])
    `, [txnIds]);

    console.log('2️⃣  Matching records in sp_v2_transactions:');
    console.log('   Found:', txnsResult.rows.length, 'out of', txnIds.length);
    console.log('');

    if (txnsResult.rows.length === 0) {
      console.log('❌ ISSUE FOUND: Settlement items reference transaction_ids that don\'t exist in sp_v2_transactions!');
      console.log('');
      console.log('Settlement items have:', txnIds);
      console.log('');

      // Check sp_v2_transactions for Oct 28
      const oct28TxnsResult = await client.query(`
        SELECT transaction_id, DATE(created_at) as date
        FROM sp_v2_transactions
        WHERE DATE(created_at) >= '2025-10-26'
        LIMIT 10
      `);

      console.log('3️⃣  Recent transactions in sp_v2_transactions:');
      oct28TxnsResult.rows.forEach((txn) => {
        console.log('   ', txn.transaction_id, '(Date:', txn.date + ')');
      });
    }

    console.log('');

    // Try the actual report query
    const reportResult = await client.query(`
      SELECT
        t.transaction_id,
        si.amount_paise,
        sb.cycle_date
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE sb.id = $1
      LIMIT 5
    `, [batchId]);

    console.log('4️⃣  Report Query Results:');
    console.log('   Rows returned:', reportResult.rows.length);
    if (reportResult.rows.length > 0) {
      reportResult.rows.forEach((row) => {
        console.log('   ', row.transaction_id, '- ₹' + (row.amount_paise / 100).toFixed(2));
      });
    } else {
      console.log('   ❌ NO ROWS - Join is failing!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

debugJoin().catch(console.error);
