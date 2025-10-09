const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkStagingSettlement() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  CHECKING STAGING SETTLEMENT - AFTER v2.32.0 DEPLOYMENT  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const jobId = '95e7776a-04c1-43b3-89ad-3df90d32a622';

    // Check reconciliation job
    const job = await pool.query(`
      SELECT job_id, status, matched_records, exception_records, created_at
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [jobId]);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('RECONCILIATION JOB');
    console.log('═══════════════════════════════════════════════════════════');
    if (job.rows.length > 0) {
      console.log(`✅ Job ID: ${job.rows[0].job_id}`);
      console.log(`   Status: ${job.rows[0].status}`);
      console.log(`   Matched: ${job.rows[0].matched_records}`);
      console.log(`   Exceptions: ${job.rows[0].exception_records}`);
      console.log(`   Created: ${job.rows[0].created_at}\n`);
    } else {
      console.log('❌ Job not found in database\n');
      return;
    }

    // Check settlement batch
    const batches = await pool.query(`
      SELECT
        id,
        merchant_id,
        merchant_name,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        net_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
    `);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('SETTLEMENT BATCHES (Last 10 minutes)');
    console.log('═══════════════════════════════════════════════════════════');

    if (batches.rows.length > 0) {
      batches.rows.forEach((batch, idx) => {
        console.log(`\n${idx + 1}. Batch ${batch.id.substring(0, 8)}...`);
        console.log(`   Merchant: ${batch.merchant_id} (${batch.merchant_name})`);
        console.log(`   Transactions: ${batch.total_transactions}`);
        console.log(`   Gross Amount: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
        console.log(`   Commission: ₹${(batch.total_commission_paise / 100).toFixed(2)}`);
        console.log(`   GST: ₹${(batch.total_gst_paise / 100).toFixed(2)}`);
        console.log(`   Net Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
        console.log(`   Status: ${batch.status}`);
        console.log(`   Created: ${batch.created_at}`);
      });
    } else {
      console.log('❌ No settlement batches created in last 10 minutes\n');
      console.log('Possible reasons:');
      console.log('  1. Settlement trigger condition not met (matched = 0)');
      console.log('  2. Settlement calculation failed');
      console.log('  3. Mock merchant config issue');
    }

    // Check settlement items if batch exists
    if (batches.rows.length > 0) {
      const batchId = batches.rows[0].id;

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('SETTLEMENT ITEMS');
      console.log('═══════════════════════════════════════════════════════════');

      const items = await pool.query(`
        SELECT
          COUNT(*) as count,
          SUM(amount_paise) as total_gross,
          SUM(commission_paise) as total_commission,
          SUM(gst_paise) as total_gst,
          SUM(net_paise) as total_net
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
      `, [batchId]);

      if (items.rows[0].count > 0) {
        console.log(`\n✅ ${items.rows[0].count} settlement items created`);
        console.log(`   Total Gross: ₹${(items.rows[0].total_gross / 100).toFixed(2)}`);
        console.log(`   Total Commission: ₹${(items.rows[0].total_commission / 100).toFixed(2)}`);
        console.log(`   Total GST: ₹${(items.rows[0].total_gst / 100).toFixed(2)}`);
        console.log(`   Total Net: ₹${(items.rows[0].total_net / 100).toFixed(2)}`);
      }

      // Check transaction linking
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('TRANSACTION LINKING');
      console.log('═══════════════════════════════════════════════════════════');

      const linkedTxns = await pool.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_transactions
        WHERE settlement_batch_id = $1
      `, [batchId]);

      console.log(`\n✅ ${linkedTxns.rows[0].count} transactions linked to batch`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

checkStagingSettlement()
  .then(() => {
    console.log('✅ Check complete');
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
