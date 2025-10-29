const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function checkOverviewData() {
  const client = await pool.connect();
  try {
    console.log('========================================');
    console.log('Checking Staging 2 RDS Data for Overview');
    console.log('Date: 2025-10-27');
    console.log('========================================\n');

    // Check transactions by status
    console.log('1. TRANSACTIONS BY STATUS (sp_v2_transactions)');
    const txnByStatus = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-27'
      GROUP BY status
      ORDER BY status
    `);

    console.log('   Status breakdown:');
    txnByStatus.rows.forEach(row => {
      console.log(`     ${row.status}: ${row.count} txns, ₹${(row.total_paise / 100).toFixed(2)}`);
    });

    const totalTxns = txnByStatus.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalAmount = txnByStatus.rows.reduce((sum, row) => sum + parseInt(row.total_paise), 0);
    console.log(`   TOTAL: ${totalTxns} txns, ₹${(totalAmount / 100).toFixed(2)}\n`);

    // Check transactions by source_type
    console.log('2. TRANSACTIONS BY SOURCE (sp_v2_transactions)');
    const txnBySource = await client.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-27'
      GROUP BY source_type
      ORDER BY source_type
    `);

    console.log('   Source breakdown:');
    txnBySource.rows.forEach(row => {
      console.log(`     ${row.source_type}: ${row.count} txns, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Check bank statements
    console.log('3. BANK STATEMENTS (sp_v2_bank_statements)');
    const bankStmts = await client.query(`
      SELECT
        COUNT(*) as count,
        SUM(amount_paise) as total_paise,
        COUNT(DISTINCT bank_name) as bank_count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log(`   Total: ${bankStmts.rows[0].count} records`);
    console.log(`   Amount: ₹${(bankStmts.rows[0].total_paise / 100).toFixed(2)}`);
    console.log(`   Banks: ${bankStmts.rows[0].bank_count}\n`);

    // Check by bank
    const bankByName = await client.query(`
      SELECT
        bank_name,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-27'
      AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    console.log('   By bank:');
    bankByName.rows.forEach(row => {
      console.log(`     ${row.bank_name}: ${row.count} records, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Check settlement batches
    console.log('4. SETTLEMENT BATCHES (sp_v2_settlement_batches)');
    const batches = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        status,
        total_transactions,
        gross_amount_paise,
        net_amount_paise
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-27'
      ORDER BY created_at
    `);

    console.log(`   Total batches: ${batches.rowCount}`);
    batches.rows.forEach((batch, i) => {
      console.log(`   Batch ${i+1}:`);
      console.log(`     ID: ${batch.id}`);
      console.log(`     Merchant: ${batch.merchant_id}`);
      console.log(`     Status: ${batch.status}`);
      console.log(`     Transactions: ${batch.total_transactions}`);
      console.log(`     Gross: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`     Net: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Check settlement items
    console.log('5. SETTLEMENT ITEMS (sp_v2_settlement_items)');
    const items = await client.query(`
      SELECT
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_settlement_items si
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE DATE(sb.cycle_date) = '2025-10-27'
    `);

    console.log(`   Total items: ${items.rows[0].count}`);
    console.log(`   Total amount: ₹${(items.rows[0].total_paise / 100).toFixed(2)}\n`);

    // Expected Overview Dashboard Counts
    console.log('========================================');
    console.log('EXPECTED OVERVIEW DASHBOARD (2025-10-27)');
    console.log('========================================\n');

    // Calculate pipeline counts
    const captured = totalTxns; // All transactions

    const settledTxns = txnByStatus.rows.find(r => r.status === 'SETTLED');
    const reconciledTxns = txnByStatus.rows.find(r => r.status === 'RECONCILED');
    const pendingTxns = txnByStatus.rows.find(r => r.status === 'PENDING');
    const successTxns = txnByStatus.rows.find(r => r.status === 'SUCCESS');

    const inSettlement = (reconciledTxns?.count || 0) + (settledTxns?.count || 0);
    const sentToBank = 0; // Need to check if any batches sent to bank
    const credited = 0; // Need to check if any batches credited
    const unsettled = (pendingTxns?.count || 0) + (successTxns?.count || 0);

    console.log('PIPELINE:');
    console.log(`  Captured: ${captured} (all transactions)`);
    console.log(`  In Settlement: ${inSettlement} (RECONCILED + SETTLED)`);
    console.log(`  Sent to Bank: ${sentToBank}`);
    console.log(`  Credited: ${credited}`);
    console.log(`  Unsettled: ${unsettled} (PENDING + SUCCESS)\n`);

    // Reconciliation
    const manualSource = txnBySource.rows.find(r => r.source_type === 'MANUAL_UPLOAD');
    const connectorSource = txnBySource.rows.find(r => r.source_type === 'PG_CONNECTOR');

    console.log('RECONCILIATION:');
    console.log(`  By Source:`);
    console.log(`    Manual: ${manualSource?.count || 0}`);
    console.log(`    Connector: ${connectorSource?.count || 0}`);
    console.log(`  By Status:`);
    console.log(`    Matched: ${reconciledTxns?.count || 0} (RECONCILED status)`);
    console.log(`    Unmatched: ${unsettled} (PENDING + SUCCESS)`);
    console.log(`    Exceptions: 0\n`);

    // Financial
    console.log('FINANCIAL:');
    console.log(`  Gross Amount: ₹${(totalAmount / 100).toFixed(2)}`);
    console.log(`  Reconciled Amount: ₹${((reconciledTxns?.total_paise || 0) / 100).toFixed(2)}`);
    console.log(`  Unreconciled Amount: ₹${(((pendingTxns?.total_paise || 0) + (successTxns?.total_paise || 0)) / 100).toFixed(2)}\n`);

    console.log('========================================');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkOverviewData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
