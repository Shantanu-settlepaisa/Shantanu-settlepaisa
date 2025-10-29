const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function fixCycleDate() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔧 FIXING SETTLEMENT BATCH CYCLE_DATE');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const batchId = '66103ed1-e0c4-4b0b-b2ea-b246409972f5';

    // First, show current state
    console.log('1️⃣  Current State:');
    const beforeResult = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE id = $1
    `, [batchId]);

    if (beforeResult.rows.length === 0) {
      console.log('   ❌ Batch not found!');
      return;
    }

    const before = beforeResult.rows[0];
    console.log(`   Batch ID: ${before.id}`);
    console.log(`   Merchant: ${before.merchant_id}`);
    console.log(`   Current cycle_date: ${before.cycle_date.toISOString().split('T')[0]}`);
    console.log(`   Transactions: ${before.total_transactions}`);
    console.log(`   GMV: ₹${(before.gross_amount_paise / 100).toFixed(2)}`);
    console.log('');

    // Update cycle_date to match transaction dates
    console.log('2️⃣  Updating cycle_date to 2025-10-28...');
    const updateResult = await client.query(`
      UPDATE sp_v2_settlement_batches
      SET
        cycle_date = '2025-10-28',
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, cycle_date
    `, [batchId]);

    if (updateResult.rows.length > 0) {
      console.log('   ✅ Update successful!');
      console.log(`   New cycle_date: ${updateResult.rows[0].cycle_date.toISOString().split('T')[0]}`);
    }
    console.log('');

    // Verify the fix
    console.log('3️⃣  Verification:');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as batch_count,
        SUM(gross_amount_paise) as total_gmv,
        SUM(settlepaisa_revenue_paise) as total_revenue,
        SUM(total_transactions) as total_txns
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-28'
    `);

    const verify = verifyResult.rows[0];
    console.log(`   Batches on 2025-10-28: ${verify.batch_count}`);
    console.log(`   Total GMV: ₹${(verify.total_gmv / 100).toFixed(2)}`);
    console.log(`   Total Revenue: ₹${(verify.total_revenue / 100).toFixed(2)}`);
    console.log(`   Total Transactions: ${verify.total_txns}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ FIX COMPLETE!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('1. Test Financial API:');
    console.log('   curl "http://52.66.199.215:5108/api/analytics/financial?from=2025-10-28&to=2025-10-28"');
    console.log('');
    console.log('2. Refresh Financial Dashboard in browser');
    console.log('   Expected: GMV ≈ ₹2.2L, Revenue ≈ ₹4.4K, Count = 10');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixCycleDate().catch(console.error);
