const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugTransactionFilter() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DEBUGGING TRANSACTION_DATE FILTER');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const batchId = '66103ed1-e0c4-4b0b-b2ea-b246409972f5';

    // Check settlement_items for this batch
    console.log('1️⃣  Settlement Items:');
    const itemsResult = await client.query(`
      SELECT COUNT(*) as item_count
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id = $1
    `, [batchId]);
    console.log(`   Items in batch: ${itemsResult.rows[0].item_count}`);
    console.log('');

    // Test the JOIN query
    console.log('2️⃣  Testing JOIN query (transaction_date filter):');
    const joinResult = await client.query(`
      SELECT
        COUNT(DISTINCT b.id) as batch_count,
        COUNT(*) as row_count,
        SUM(b.gross_amount_paise) as total_gmv
      FROM sp_v2_settlement_batches b
      INNER JOIN sp_v2_settlement_items si ON b.id = si.settlement_batch_id
      INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
      WHERE DATE(t.transaction_date) = '2025-10-28'
        AND b.status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL')
    `);

    const join = joinResult.rows[0];
    console.log(`   Distinct Batches: ${join.batch_count}`);
    console.log(`   Total Rows: ${join.row_count}`);
    console.log(`   Total GMV: ₹${(join.total_gmv / 100).toFixed(2)}`);
    console.log('');

    console.log('   ⚠️  Problem: SUM aggregates BEFORE grouping by batch!');
    console.log('   Each settlement_item row multiplies the batch total.');
    console.log('');

    // Correct query using DISTINCT or GROUP BY first
    console.log('3️⃣  Correct query (aggregate per batch first):');
    const correctResult = await client.query(`
      WITH batch_data AS (
        SELECT DISTINCT
          b.id,
          b.gross_amount_paise,
          b.total_commission_paise,
          b.total_gst_paise,
          b.total_bank_charges_paise,
          b.settlepaisa_revenue_paise,
          b.net_amount_paise,
          b.total_transactions,
          b.merchant_id
        FROM sp_v2_settlement_batches b
        INNER JOIN sp_v2_settlement_items si ON b.id = si.settlement_batch_id
        INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
        WHERE DATE(t.transaction_date) = '2025-10-28'
          AND b.status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL')
      )
      SELECT
        COUNT(*) as batch_count,
        SUM(gross_amount_paise) as total_gmv,
        SUM(total_commission_paise) as total_mdr,
        SUM(total_transactions) as total_txns
      FROM batch_data
    `);

    const correct = correctResult.rows[0];
    console.log(`   Batches: ${correct.batch_count}`);
    console.log(`   GMV: ₹${(correct.total_gmv / 100).toFixed(2)} ✅`);
    console.log(`   Transactions: ${correct.total_txns}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('📝 FIX NEEDED:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('The JOIN query needs to use DISTINCT on batch columns');
    console.log('or aggregate batch-level data first before summing.');
    console.log('');
    console.log('Solution: Use a CTE to get distinct batches, then SUM.');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

debugTransactionFilter().catch(console.error);
