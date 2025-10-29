#!/usr/bin/env node

/**
 * Backfill Script: Update sp_v2_transactions.status based on sp_v2_reconciliation_results
 *
 * Problem: Existing reconciliation results don't have corresponding status updates
 * in sp_v2_transactions, causing Overview dashboard to show 0% match rate.
 *
 * Solution: This script reads all reconciliation results and updates transaction
 * statuses accordingly:
 * - MATCHED → status = 'RECONCILED'
 * - UNMATCHED_PG → status = 'UNMATCHED'
 * - EXCEPTION → status = 'EXCEPTION'
 *
 * Date: October 26, 2025
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'settlepaisa-dev-db.cvdzuahlio62.ap-south-1.rds.amazonaws.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'settlepaisa_v2_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'SabPaisa@2025',
});

async function backfillReconciliationStatuses() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting backfill of sp_v2_transactions statuses...\n');

    await client.query('BEGIN');

    // 1. Update MATCHED transactions to RECONCILED
    console.log('📊 Step 1: Updating MATCHED transactions...');
    const matchedResult = await client.query(`
      UPDATE sp_v2_transactions t
      SET status = 'RECONCILED',
          updated_at = NOW()
      FROM sp_v2_reconciliation_results r
      WHERE r.pg_transaction_id = t.transaction_id
        AND r.match_status = 'MATCHED'
        AND t.status != 'RECONCILED'
    `);
    console.log(`   ✅ Updated ${matchedResult.rowCount} transactions to RECONCILED\n`);

    // 2. Update UNMATCHED_PG transactions to UNMATCHED
    console.log('📊 Step 2: Updating UNMATCHED_PG transactions...');
    const unmatchedResult = await client.query(`
      UPDATE sp_v2_transactions t
      SET status = 'UNMATCHED',
          updated_at = NOW()
      FROM sp_v2_reconciliation_results r
      WHERE r.pg_transaction_id = t.transaction_id
        AND r.match_status = 'UNMATCHED_PG'
        AND t.status != 'UNMATCHED'
    `);
    console.log(`   ✅ Updated ${unmatchedResult.rowCount} transactions to UNMATCHED\n`);

    // 3. Update EXCEPTION transactions to EXCEPTION
    console.log('📊 Step 3: Updating EXCEPTION transactions...');
    const exceptionResult = await client.query(`
      UPDATE sp_v2_transactions t
      SET status = 'EXCEPTION',
          updated_at = NOW()
      FROM sp_v2_reconciliation_results r
      WHERE r.pg_transaction_id = t.transaction_id
        AND r.match_status = 'EXCEPTION'
        AND t.status != 'EXCEPTION'
    `);
    console.log(`   ✅ Updated ${exceptionResult.rowCount} transactions to EXCEPTION\n`);

    await client.query('COMMIT');
    console.log('✅ Backfill completed successfully!');

    // Verify the results
    console.log('\n📈 Verification - Current status distribution:');
    const verifyResult = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM sp_v2_transactions
      GROUP BY status
      ORDER BY count DESC
    `);

    console.table(verifyResult.rows);

    console.log('\n📊 Match Rate Calculation:');
    const matchRateResult = await client.query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as matched_count,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'RECONCILED') * 100.0 / NULLIF(COUNT(*), 0),
          2
        ) as match_rate_pct
      FROM sp_v2_transactions
      WHERE created_at::date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    const stats = matchRateResult.rows[0];
    console.log(`   Total Transactions (last 7 days): ${stats.total_transactions}`);
    console.log(`   Matched (RECONCILED): ${stats.matched_count}`);
    console.log(`   Match Rate: ${stats.match_rate_pct}%`);

    console.log('\n🎉 Backfill complete! Dashboard should now show correct match rates.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Backfill failed:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the backfill
backfillReconciliationStatuses().catch(console.error);
