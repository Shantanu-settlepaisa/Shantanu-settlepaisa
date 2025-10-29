const { SettlementScheduler } = require('./services/settlement-engine/settlement-scheduler.cjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function testSettlementIntegration() {
  console.log('🧪 Testing Webhook Settlement Integration\n');
  
  try {
    // Step 1: Check unsettled transactions BEFORE
    console.log('📊 BEFORE Settlement:');
    const beforeResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(SUM(amount_paise)/100, 2) as total_rupees
      FROM sp_v2_transactions
      WHERE status IN ('RECONCILED', 'SUCCESS')
        AND settlement_batch_id IS NULL
      GROUP BY status
      ORDER BY status
    `);
    
    console.table(beforeResult.rows);
    
    const totalBefore = beforeResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    console.log(`Total unsettled: ${totalBefore} transactions\n`);
    
    // Step 2: Run settlement
    console.log('🚀 Running Settlement Scheduler...\n');
    const scheduler = new SettlementScheduler();
    
    const result = await scheduler.runSettlement('manual', 'test_script', {
      fromDate: '2025-10-01',
      toDate: '2025-10-06'
    });
    
    console.log('\n✅ Settlement Result:');
    console.log('  - Status:', result.status);
    console.log('  - Merchants Processed:', result.merchantsProcessed);
    console.log('  - Batches Created:', result.batchesCreated);
    console.log('  - Total Settled:', `₹${(result.totalAmountSettled / 100).toFixed(2)}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.error}`);
      });
    }
    
    // Step 3: Check unsettled transactions AFTER
    console.log('\n📊 AFTER Settlement:');
    const afterResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(SUM(amount_paise)/100, 2) as total_rupees
      FROM sp_v2_transactions
      WHERE status IN ('RECONCILED', 'SUCCESS')
        AND settlement_batch_id IS NULL
      GROUP BY status
      ORDER BY status
    `);
    
    console.table(afterResult.rows);
    
    const totalAfter = afterResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    console.log(`Total unsettled: ${totalAfter} transactions`);
    console.log(`\n✨ Settled: ${totalBefore - totalAfter} transactions\n`);
    
    // Step 4: Show created batches
    console.log('📦 Settlement Batches Created:');
    const batchesResult = await pool.query(`
      SELECT 
        id,
        merchant_id,
        cycle_date::date,
        total_transactions,
        ROUND(net_amount_paise/100, 2) as net_amount_rupees,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.table(batchesResult.rows);
    
    // Step 5: Verify settlement items
    console.log('\n🔗 Settlement Items (FK Verification):');
    const itemsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(DISTINCT settlement_batch_id) as batches,
        COUNT(DISTINCT transaction_id) as unique_transactions
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      )
    `);
    
    console.log('  - Total items:', itemsResult.rows[0].total_items);
    console.log('  - Batches:', itemsResult.rows[0].batches);
    console.log('  - Unique transactions:', itemsResult.rows[0].unique_transactions);
    
    // Step 6: Verify webhook transactions were settled
    console.log('\n🔵 Webhook Transactions Settled:');
    const webhookResult = await pool.query(`
      SELECT COUNT(*) as webhook_settled
      FROM sp_v2_transactions
      WHERE source_type = 'WEBHOOK'
        AND status = 'SUCCESS'
        AND settlement_batch_id IS NOT NULL
    `);
    
    console.log(`  ✅ ${webhookResult.rows[0].webhook_settled} webhook transactions now settled!`);
    
    console.log('\n🎉 Test Complete!\n');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testSettlementIntegration();
