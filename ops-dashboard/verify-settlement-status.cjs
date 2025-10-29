const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function verifySettlementStatus() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 VERIFYING SETTLEMENT STATUS FOR 2025-10-28');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Check settlement_batches
    console.log('1️⃣  sp_v2_settlement_batches (Financial Dashboard data source):');
    const batchesResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        settlepaisa_revenue_paise,
        net_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-28'
      ORDER BY created_at DESC
    `);

    if (batchesResult.rows.length > 0) {
      console.log(`   ✅ Found ${batchesResult.rows.length} settlement batch(es):`);
      batchesResult.rows.forEach((batch, idx) => {
        console.log(`   ${idx + 1}. Batch ID: ${batch.id}`);
        console.log(`      Merchant: ${batch.merchant_id}`);
        console.log(`      Transactions: ${batch.total_transactions}`);
        console.log(`      GMV: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
        console.log(`      Revenue: ₹${(batch.settlepaisa_revenue_paise / 100).toFixed(2)}`);
        console.log(`      Net Payout: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
        console.log(`      Status: ${batch.status}`);
        console.log(`      Created: ${batch.created_at}`);
      });
    } else {
      console.log('   ❌ NO BATCHES FOUND for 2025-10-28');
    }
    console.log('');

    // Check settlement_queue
    console.log('2️⃣  sp_v2_settlement_queue (Pending transactions):');
    const queueResult = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_amount
      FROM sp_v2_settlement_queue
      GROUP BY status
      ORDER BY status
    `);

    if (queueResult.rows.length > 0) {
      console.log('   Status breakdown:');
      queueResult.rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} transactions, Total: ₹${(row.total_amount / 100).toFixed(2)}`);
      });
    } else {
      console.log('   ✅ Queue is empty (all processed)');
    }
    console.log('');

    // Check queue items for 2025-10-28 specifically
    const queueDetailsResult = await client.query(`
      SELECT
        sq.transaction_id,
        sq.merchant_id,
        sq.amount_paise,
        sq.status as queue_status,
        sq.queued_at,
        t.status as transaction_status,
        t.settlement_batch_id
      FROM sp_v2_settlement_queue sq
      LEFT JOIN sp_v2_transactions t ON sq.transaction_id = t.transaction_id
      WHERE DATE(sq.queued_at) = '2025-10-28'
      ORDER BY sq.queued_at
      LIMIT 10
    `);

    if (queueDetailsResult.rows.length > 0) {
      console.log('3️⃣  Queue items from 2025-10-28:');
      queueDetailsResult.rows.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.transaction_id}`);
        console.log(`      Queue Status: ${item.queue_status}`);
        console.log(`      Transaction Status: ${item.transaction_status}`);
        console.log(`      Batch ID: ${item.settlement_batch_id || 'None'}`);
        console.log(`      Queued At: ${item.queued_at}`);
      });
      console.log('');
    }

    // Check transaction status
    console.log('4️⃣  sp_v2_transactions (Raw transaction data):');
    const transactionsResult = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_amount
      FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-28'
      GROUP BY status
    `);

    if (transactionsResult.rows.length > 0) {
      console.log('   Status breakdown:');
      transactionsResult.rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} transactions, Total: ₹${(row.total_amount / 100).toFixed(2)}`);
      });
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 DIAGNOSIS:');
    console.log('═══════════════════════════════════════════════════════');

    if (batchesResult.rows.length === 0) {
      console.log('❌ No settlement batches exist for 2025-10-28');
      console.log('   → Financial Dashboard will show ₹0 (CORRECT behavior)');
      console.log('');

      if (queueDetailsResult.rows.length > 0) {
        const pendingCount = queueDetailsResult.rows.filter(r => r.queue_status === 'PENDING').length;
        if (pendingCount > 0) {
          console.log(`⚠️  ${pendingCount} transactions stuck in queue with status PENDING`);
          console.log('   → Settlement queue processor is likely NOT RUNNING');
          console.log('   → Need to start: settlement-queue-processor.cjs');
        } else {
          console.log('✅ Queue items are processed but batches not visible');
          console.log('   → Check if batches were created with different cycle_date');
        }
      }
    } else {
      console.log(`✅ ${batchesResult.rows.length} settlement batch(es) found`);
      console.log('   → Financial Dashboard should show data');
      console.log('   → If dashboard still shows ₹0, check API/frontend');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifySettlementStatus().catch(console.error);
