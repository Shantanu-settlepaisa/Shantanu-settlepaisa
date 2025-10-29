const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function countTransactionsPerReport() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 EXPECTED TRANSACTION COUNTS PER REPORT TAB');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('Filter: Cycle Date = 2025-10-27, Merchant = MERCH001');
    console.log('');

    // 1. Settlement Transactions Report
    const settlementTxnsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE to_char(sb.cycle_date, 'YYYY-MM-DD') = '2025-10-27'
        AND sb.merchant_id = 'MERCH001'
    `);

    console.log('1️⃣  SETTLEMENT TRANSACTIONS TAB');
    console.log('   Expected count:', settlementTxnsResult.rows[0].count, 'transactions');
    console.log('   Shows: Transaction-level settlement data with fee breakdown');
    console.log('');

    // Get sample to show what's included
    const settlementSampleResult = await client.query(`
      SELECT
        t.transaction_id,
        si.amount_paise,
        si.commission_paise,
        si.gst_paise,
        si.net_paise
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE to_char(sb.cycle_date, 'YYYY-MM-DD') = '2025-10-27'
        AND sb.merchant_id = 'MERCH001'
      LIMIT 5
    `);

    console.log('   Sample transactions:');
    settlementSampleResult.rows.forEach((row, idx) => {
      console.log(`     ${idx + 1}. ${row.transaction_id} - ₹${(row.amount_paise / 100).toFixed(2)} (Net: ₹${(row.net_paise / 100).toFixed(2)})`);
    });
    console.log('');

    // 2. Recon Outcome Report
    const reconOutcomeResult = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE to_char(created_at, 'YYYY-MM-DD') = '2025-10-28'
    `);

    console.log('2️⃣  RECON OUTCOME TAB');
    console.log('   Expected count:', reconOutcomeResult.rows[0].count, 'records');
    console.log('   Shows: Reconciliation results (matched/unmatched/exceptions)');
    console.log('');

    // Get breakdown by status
    const reconBreakdownResult = await client.query(`
      SELECT
        match_status,
        COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE to_char(created_at, 'YYYY-MM-DD') = '2025-10-28'
      GROUP BY match_status
    `);

    console.log('   Breakdown by status:');
    reconBreakdownResult.rows.forEach((row) => {
      console.log(`     - ${row.match_status}: ${row.count} records`);
    });
    console.log('');

    // 3. Bank MIS Report
    const bankMISResult = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE to_char(transaction_date, 'YYYY-MM-DD') = '2025-10-28'
    `);

    console.log('3️⃣  BANK MIS TAB');
    console.log('   Expected count:', bankMISResult.rows[0].count, 'bank statements');
    console.log('   Shows: Bank statement data with reconciliation status');
    console.log('');

    // Get breakdown by bank
    const bankBreakdownResult = await client.query(`
      SELECT
        source_type,
        COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE to_char(transaction_date, 'YYYY-MM-DD') = '2025-10-28'
      GROUP BY source_type
    `);

    console.log('   Breakdown by bank:');
    if (bankBreakdownResult.rows.length > 0) {
      bankBreakdownResult.rows.forEach((row) => {
        console.log(`     - ${row.source_type || 'Unknown'}: ${row.count} statements`);
      });
    } else {
      console.log('     (No breakdown available)');
    }
    console.log('');

    // 4. Show totals summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('Settlement Transactions:', settlementTxnsResult.rows[0].count, '(from settlement_items)');
    console.log('Recon Outcome:         ', reconOutcomeResult.rows[0].count, '(from reconciliation_results)');
    console.log('Bank MIS:              ', bankMISResult.rows[0].count, '(from bank_statements)');
    console.log('');

    // 5. Check if counts match
    const pgTxnsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE to_char(created_at, 'YYYY-MM-DD') = '2025-10-28'
        AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log('Cross-check:');
    console.log('  PG Transactions uploaded on Oct 28:', pgTxnsResult.rows[0].count);
    console.log('  Bank Statements uploaded on Oct 28:', bankMISResult.rows[0].count);
    console.log('  Reconciliation Results from Oct 28:', reconOutcomeResult.rows[0].count);
    console.log('');

    if (pgTxnsResult.rows[0].count === reconOutcomeResult.rows[0].count) {
      console.log('  ✅ Recon results match PG transactions uploaded');
    } else {
      console.log('  ⚠️  Recon results count mismatch!');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📝 FILTER INSTRUCTIONS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('1. Settlement Transactions Tab:');
    console.log('   - Cycle Date: 27/10/2025 (or 2025-10-27)');
    console.log('   - Merchant ID: MERCH001');
    console.log('');
    console.log('2. Recon Outcome Tab:');
    console.log('   - Cycle Date: 28/10/2025 (or 2025-10-28)');
    console.log('   - (Filters by reconciliation date, not settlement cycle)');
    console.log('');
    console.log('3. Bank MIS Tab:');
    console.log('   - Cycle Date: 28/10/2025 (or 2025-10-28)');
    console.log('   - (Filters by bank transaction_date)');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

countTransactionsPerReport().catch(console.error);
