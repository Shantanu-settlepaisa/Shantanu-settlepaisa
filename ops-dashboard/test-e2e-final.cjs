const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function testE2EFlow() {
  try {
    console.log('========== E2E SETTLEMENT FLOW TEST ==========\n');

    // Check reconciliation results
    const reconJobs = await pool.query(`
      SELECT job_id, status, matched_records, total_pg_records
      FROM sp_v2_reconciliation_jobs
      WHERE processing_end >= NOW() - INTERVAL '15 minutes'
      ORDER BY processing_end DESC
      LIMIT 1
    `);

    if (reconJobs.rows.length > 0) {
      const job = reconJobs.rows[0];
      console.log('📊 Latest Reconciliation Job:');
      console.log(`   Job ID: ${job.job_id}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Matched: ${job.matched_records}/${job.total_pg_records}`);
      console.log('');
    } else {
      console.log('❌ No recent reconciliation jobs found');
      return;
    }

    // Check settlement batches
    const batches = await pool.query(`
      SELECT
        id,
        merchant_id,
        total_transactions,
        gross_amount_paise,
        net_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (batches.rows.length > 0) {
      const batch = batches.rows[0];
      console.log('✅ Settlement Batch Created:');
      console.log(`   Batch ID: ${batch.id}`);
      console.log(`   Merchant: ${batch.merchant_id}`);
      console.log(`   Transactions: ${batch.total_transactions}`);
      console.log(`   Gross Amount: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`   Net Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
      console.log(`   Status: ${batch.status}`);
      console.log('');

      // Check settlement items
      const items = await pool.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
      `, [batch.id]);
      console.log(`✅ Settlement Items: ${items.rows[0].count} items`);

      // Check if transactions are linked
      const linked = await pool.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_transactions
        WHERE settlement_batch_id = $1
      `, [batch.id]);
      console.log(`✅ Transactions Linked: ${linked.rows[0].count} transactions`);

      // Sample linked transaction
      const sample = await pool.query(`
        SELECT
          transaction_id,
          merchant_id,
          amount_paise,
          status,
          settlement_batch_id
        FROM sp_v2_transactions
        WHERE settlement_batch_id = $1
        LIMIT 1
      `, [batch.id]);

      if (sample.rows.length > 0) {
        const txn = sample.rows[0];
        console.log('\\n📝 Sample Linked Transaction:');
        console.log(`   Transaction ID: ${txn.transaction_id}`);
        console.log(`   Merchant: ${txn.merchant_id}`);
        console.log(`   Amount: ₹${(txn.amount_paise / 100).toFixed(2)}`);
        console.log(`   Status: ${txn.status}`);
        console.log(`   Settlement Batch ID: ${txn.settlement_batch_id}`);
      }

    } else {
      console.log('❌ No recent settlement batches found');
    }

    console.log('\\n=========================================');
    console.log('✅ E2E FLOW COMPLETE!');
    console.log('=========================================\\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testE2EFlow();
