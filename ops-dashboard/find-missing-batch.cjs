const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function findMissingBatch() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 FINDING SETTLEMENT BATCH: 66103ed1-e0c4-4b0b-b2ea-b246409972f5');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const batchId = '66103ed1-e0c4-4b0b-b2ea-b246409972f5';

    // Search for the batch
    const batchResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        settlepaisa_revenue_paise,
        net_amount_paise,
        status,
        created_at,
        updated_at
      FROM sp_v2_settlement_batches
      WHERE id = $1
    `, [batchId]);

    if (batchResult.rows.length > 0) {
      const batch = batchResult.rows[0];
      console.log('✅ BATCH FOUND!');
      console.log('');
      console.log(`Batch ID: ${batch.id}`);
      console.log(`Merchant: ${batch.merchant_id}`);
      console.log(`Cycle Date: ${batch.cycle_date} ⚠️ (Expected: 2025-10-28)`);
      console.log(`Transactions: ${batch.total_transactions}`);
      console.log(`GMV: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`Revenue: ₹${(batch.settlepaisa_revenue_paise / 100).toFixed(2)}`);
      console.log(`Net Payout: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
      console.log(`Status: ${batch.status}`);
      console.log(`Created: ${batch.created_at}`);
      console.log(`Updated: ${batch.updated_at}`);
      console.log('');

      // Check if cycle_date is different from 2025-10-28
      const cycleDate = batch.cycle_date.toISOString().split('T')[0];
      if (cycleDate !== '2025-10-28') {
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔴 ROOT CAUSE IDENTIFIED:');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log(`❌ Batch has WRONG cycle_date: ${cycleDate}`);
        console.log('   Expected: 2025-10-28');
        console.log('   Actual:   ' + cycleDate);
        console.log('');
        console.log('💡 Financial API filters by cycle_date = "2025-10-28"');
        console.log(`   But batch was created with cycle_date = "${cycleDate}"`);
        console.log('   → Dashboard shows ₹0 (batch not matched by date filter)');
        console.log('');
        console.log('🔧 SOLUTION OPTIONS:');
        console.log('');
        console.log('Option 1: Update batch cycle_date to 2025-10-28');
        console.log(`   UPDATE sp_v2_settlement_batches`);
        console.log(`   SET cycle_date = '2025-10-28'`);
        console.log(`   WHERE id = '${batchId}'`);
        console.log('');
        console.log('Option 2: Check Financial Dashboard with correct date');
        console.log(`   Filter by: ${cycleDate} (the actual cycle_date)`);
        console.log('');
      } else {
        console.log('✅ Cycle date is correct (2025-10-28)');
        console.log('   → Issue must be elsewhere (check status filter in API)');
      }

      // Check settlement items
      console.log('═══════════════════════════════════════════════════════');
      console.log('📦 SETTLEMENT ITEMS IN THIS BATCH:');
      console.log('═══════════════════════════════════════════════════════');

      const itemsResult = await client.query(`
        SELECT
          transaction_id,
          gross_amount_paise,
          commission_paise,
          gst_paise,
          net_amount_paise
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
        ORDER BY transaction_id
        LIMIT 10
      `, [batchId]);

      if (itemsResult.rows.length > 0) {
        console.log(`Found ${itemsResult.rows.length} items:`);
        itemsResult.rows.forEach((item, idx) => {
          console.log(`  ${idx + 1}. ${item.transaction_id}: ₹${(item.gross_amount_paise / 100).toFixed(2)}`);
        });
      } else {
        console.log('❌ No settlement items found for this batch!');
      }

    } else {
      console.log('❌ BATCH NOT FOUND!');
      console.log('');
      console.log('This should not happen - transactions have this batch_id');
      console.log('but the batch does not exist in sp_v2_settlement_batches.');
      console.log('');
      console.log('🔧 SOLUTION: Re-run settlement queue processor');
      console.log('   The batch creation may have failed mid-process.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

findMissingBatch().catch(console.error);
