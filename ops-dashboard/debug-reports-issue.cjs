const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugReports() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DEBUGGING REPORTS ISSUE');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Issue 1: Bank MIS - Check dates
    console.log('1️⃣  BANK MIS - Checking transaction_date:');
    const bankDatesResult = await client.query(`
      SELECT
        DATE(transaction_date) as date,
        COUNT(*) as count,
        MIN(transaction_date) as earliest,
        MAX(transaction_date) as latest
      FROM sp_v2_bank_statements
      WHERE DATE(created_at) >= '2025-10-27'
      GROUP BY DATE(transaction_date)
      ORDER BY DATE(transaction_date) DESC
      LIMIT 5
    `);

    bankDatesResult.rows.forEach((row) => {
      console.log(`   Date: ${row.date} | Count: ${row.count}`);
    });
    console.log('');

    // Issue 2: Recon Outcome - Check why showing "UPLOADED"
    console.log('2️⃣  RECON OUTCOME - Checking match_status:');

    // Check transactions without reconciliation_results
    const orphanTxnsResult = await client.query(`
      SELECT
        t.transaction_id,
        t.utr,
        t.created_at,
        rr.match_status,
        CASE
          WHEN rr.match_status IS NULL AND c.utr IS NOT NULL THEN 'PENDING_RECON (has bank match)'
          WHEN rr.match_status IS NULL THEN 'UPLOADED (no recon)'
          ELSE rr.match_status
        END as computed_status
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_bank_statements c ON t.utr = c.utr
      LEFT JOIN sp_v2_reconciliation_results rr ON t.transaction_id = rr.pg_transaction_id
      WHERE DATE(t.created_at) = '2025-10-28'
      LIMIT 5
    `);

    console.log('   Sample transactions (Oct 28):');
    orphanTxnsResult.rows.forEach((row) => {
      console.log(`   - ${row.transaction_id}`);
      console.log(`     UTR: ${row.utr}`);
      console.log(`     match_status in DB: ${row.match_status || 'NULL'}`);
      console.log(`     Computed status: ${row.computed_status}`);
      console.log('');
    });

    // Check if reconciliation_results exist for Oct 28
    const reconResultsCount = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE DATE(created_at) = '2025-10-28'
    `);

    console.log('   Reconciliation results for Oct 28:', reconResultsCount.rows[0].count);
    console.log('');

    // Check the join condition issue
    console.log('3️⃣  CHECKING JOIN CONDITION:');
    const joinTestResult = await client.query(`
      SELECT
        t.transaction_id,
        t.id as txn_id,
        rr.pg_transaction_id,
        t.id::TEXT = rr.pg_transaction_id as join_matches,
        rr.match_status
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_reconciliation_results rr ON t.transaction_id = rr.pg_transaction_id
      WHERE DATE(t.created_at) = '2025-10-28'
      LIMIT 3
    `);

    console.log('   Join test (t.transaction_id = rr.pg_transaction_id):');
    joinTestResult.rows.forEach((row) => {
      console.log(`   - TXN ID: ${row.transaction_id}`);
      console.log(`     pg_transaction_id in recon_results: ${row.pg_transaction_id || 'NULL'}`);
      console.log(`     Match status: ${row.match_status || 'NULL'}`);
      console.log('');
    });

    // Check what pg_transaction_id actually contains
    const reconIdsResult = await client.query(`
      SELECT DISTINCT pg_transaction_id
      FROM sp_v2_reconciliation_results
      WHERE DATE(created_at) = '2025-10-28'
      LIMIT 10
    `);

    console.log('   pg_transaction_id values in reconciliation_results:');
    reconIdsResult.rows.forEach((row) => {
      console.log(`   - ${row.pg_transaction_id}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

debugReports().catch(console.error);
