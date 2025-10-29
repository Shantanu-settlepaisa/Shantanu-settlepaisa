const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function verify() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SETTLEMENT ITEMS VERIFICATION - Oct 28');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Get the batch ID from today
    const batchResult = await client.query(`
      SELECT id, merchant_id, total_transactions, net_amount_paise
      FROM sp_v2_settlement_batches
      WHERE DATE(created_at) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (batchResult.rows.length === 0) {
      console.log('❌ No settlement batch found for Oct 28');
      return;
    }

    const batch = batchResult.rows[0];
    console.log('🎯 Settlement Batch:', batch.id);
    console.log('   Merchant:', batch.merchant_id);
    console.log('   Total Transactions:', batch.total_transactions);
    console.log('   Net Amount:', batch.net_amount_paise, '(₹' + (batch.net_amount_paise / 100).toFixed(2) + ')');
    console.log('');

    // Count settlement items
    const countResult = await client.query(`
      SELECT COUNT(*) as item_count FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
    `, [batch.id]);

    const itemCount = parseInt(countResult.rows[0].item_count);
    console.log('3️⃣  SETTLEMENT ITEMS COUNT:', itemCount);

    if (itemCount === 0) {
      console.log('   ❌ NO SETTLEMENT ITEMS FOUND!');
      console.log('   This means settlement persistence failed.');
      return;
    }

    if (itemCount === 10) {
      console.log('   ✅ All 10 items created successfully!');
    } else {
      console.log('   ⚠️  Expected 10 items, found', itemCount);
    }
    console.log('');

    // Get sample items with fee breakdown
    const itemsResult = await client.query(`
      SELECT
        transaction_id,
        amount_paise,
        commission_paise,
        gst_paise,
        reserve_paise,
        net_paise,
        payment_mode,
        fee_bearer
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
      ORDER BY created_at
      LIMIT 3
    `, [batch.id]);

    console.log('4️⃣  SAMPLE SETTLEMENT ITEMS (first 3):');
    itemsResult.rows.forEach((item, idx) => {
      console.log(`\n   Item ${idx + 1}:`);
      console.log('   Transaction ID:', item.transaction_id);
      console.log('   Transaction Amount: ₹' + (item.amount_paise / 100).toFixed(2));
      console.log('   Commission: ₹' + (item.commission_paise / 100).toFixed(2));
      console.log('   GST: ₹' + (item.gst_paise / 100).toFixed(2));
      console.log('   Reserve: ₹' + (item.reserve_paise / 100).toFixed(2));
      console.log('   Net Settlement: ₹' + (item.net_paise / 100).toFixed(2));
      console.log('   Payment Mode:', item.payment_mode);
      console.log('   Fee Bearer:', item.fee_bearer);
    });

    // Verify totals
    const totalsResult = await client.query(`
      SELECT
        SUM(amount_paise) as total_txn_amt,
        SUM(commission_paise) as total_commission,
        SUM(gst_paise) as total_gst,
        SUM(reserve_paise) as total_reserve,
        SUM(net_paise) as total_net
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
    `, [batch.id]);

    console.log('');
    console.log('5️⃣  SETTLEMENT ITEMS TOTALS:');
    const totals = totalsResult.rows[0];
    console.log('   Sum of Transaction Amounts: ₹' + (totals.total_txn_amt / 100).toFixed(2));
    console.log('   Sum of Commissions: ₹' + (totals.total_commission / 100).toFixed(2));
    console.log('   Sum of GST: ₹' + (totals.total_gst / 100).toFixed(2));
    console.log('   Sum of Reserves: ₹' + (totals.total_reserve / 100).toFixed(2));
    console.log('   Sum of Net Settlements: ₹' + (totals.total_net / 100).toFixed(2));

    console.log('');
    console.log('6️⃣  BATCH vs ITEMS RECONCILIATION:');
    console.log('   Batch Net Amount: ₹' + (batch.net_amount_paise / 100).toFixed(2));
    console.log('   Items Net Total: ₹' + (totals.total_net / 100).toFixed(2));

    if (batch.net_amount_paise === parseInt(totals.total_net)) {
      console.log('   ✅ MATCH! Batch and items totals are consistent.');
    } else {
      console.log('   ❌ MISMATCH! Batch and items totals do not match.');
      console.log('   Difference: ₹' + (Math.abs(batch.net_amount_paise - totals.total_net) / 100).toFixed(2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch(console.error);
