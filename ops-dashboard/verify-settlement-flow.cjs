const { Pool } = require('pg');

const jobId = '3fd37507-a83b-48d7-929f-37986826913c';

async function checkDatabase(config, label) {
  const pool = new Pool(config);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Checking ${label}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log(`✅ Connected to ${config.host}:${config.port}/${config.database}\n`);

    // 1. Check reconciliation job
    const jobResult = await pool.query(`
      SELECT job_id, status, matched_records, unmatched_pg, exception_records, processing_end
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      console.log('📋 Reconciliation Job Found:');
      console.log(`   Status: ${job.status}`);
      console.log(`   Matched: ${job.matched_records}`);
      console.log(`   Unmatched PG: ${job.unmatched_pg}`);
      console.log(`   Exceptions: ${job.exception_records}`);
      console.log(`   Completed: ${job.processing_end}`);
    } else {
      console.log('❌ Reconciliation job NOT found');
    }

    // 2. Check reconciliation results
    const resultsCount = await pool.query(`
      SELECT match_status, COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
      GROUP BY match_status
    `, [jobId]);

    console.log('\n📊 Reconciliation Results:');
    if (resultsCount.rows.length > 0) {
      resultsCount.rows.forEach(row => {
        console.log(`   ${row.match_status}: ${row.count}`);
      });
    } else {
      console.log('   No results found');
    }

    // 3. Check transactions table
    const txnCount = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_amount
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%'
      GROUP BY status
    `);

    console.log('\n💳 Transactions Status:');
    if (txnCount.rows.length > 0) {
      txnCount.rows.forEach(row => {
        console.log(`   ${row.status}: ${row.count} txns (₹${(row.total_amount / 100).toFixed(2)})`);
      });
    } else {
      console.log('   No E2E transactions found');
    }

    // 4. Check settlement batches (last 10 minutes)
    const settlements = await pool.query(`
      SELECT
        id,
        merchant_id,
        total_transactions,
        gross_amount_paise,
        net_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('\n💰 Settlement Batches (last 10 min):');
    if (settlements.rows.length > 0) {
      settlements.rows.forEach(row => {
        console.log(`   ID: ${row.id}`);
        console.log(`     Merchant: ${row.merchant_id}`);
        console.log(`     Transactions: ${row.total_transactions}`);
        console.log(`     Gross: ₹${(row.gross_amount_paise / 100).toFixed(2)}`);
        console.log(`     Net: ₹${(row.net_amount_paise / 100).toFixed(2)}`);
        console.log(`     Status: ${row.status}`);
        console.log(`     Created: ${row.created_at.toISOString()}`);
        console.log('');
      });
    } else {
      console.log('   No recent settlement batches');
    }

    // 5. Check settlement items
    const itemsCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_settlement_items si
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE sb.created_at >= NOW() - INTERVAL '10 minutes'
    `);

    console.log(`📦 Settlement Items (last 10 min): ${itemsCount.rows[0]?.count || 0}`);

    // 6. Check transaction linkage
    const linkedTxns = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE settlement_batch_id IS NOT NULL
        AND transaction_id LIKE 'TXN_E2E%'
    `);

    console.log(`🔗 Transactions linked to settlement: ${linkedTxns.rows[0]?.count || 0}\n`);

  } catch (error) {
    console.error(`❌ Error checking ${label}:`, error.message);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        SETTLEMENT FLOW VERIFICATION                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nJob ID: ${jobId}`);

  // Check LOCAL database
  await checkDatabase({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  }, 'LOCAL DATABASE');

  // Check AWS RDS database
  await checkDatabase({
    host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
    port: 5432,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'SettlePaisa2024'
  }, 'AWS RDS STAGING');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Verification Complete');
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
