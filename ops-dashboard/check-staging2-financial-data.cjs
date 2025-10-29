const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function checkFinancialData() {
  const client = await pool.connect();
  try {
    console.log('========================================');
    console.log('FINANCIAL DASHBOARD DATA - STAGING 2');
    console.log('Date: Oct 27, 2025');
    console.log('========================================\n');

    // 1. Settlement Batches Summary
    console.log('1. SETTLEMENT BATCHES OVERVIEW');
    console.log('------------------------------');
    const batches = await client.query(`
      SELECT
        id,
        merchant_id,
        merchant_name,
        cycle_date,
        status,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        total_bank_charges_paise,
        settlepaisa_revenue_paise,
        refund_deductions_paise,
        chargeback_deductions_paise,
        net_amount_paise,
        created_at
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-27'
      ORDER BY created_at
    `);

    console.log(`Total Batches: ${batches.rowCount}\n`);

    let totalGross = 0;
    let totalTds = 0;
    let totalCommission = 0;
    let totalNet = 0;
    let totalTxnCount = 0;

    batches.rows.forEach((batch, i) => {
      console.log(`Batch ${i + 1}:`);
      console.log(`  ID: ${batch.id}`);
      console.log(`  Merchant: ${batch.merchant_id}`);
      console.log(`  Status: ${batch.status}`);
      console.log(`  Gross Amount: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`  TDS: ₹${(batch.tds_amount_paise / 100).toFixed(2)}`);
      console.log(`  Commission/MDR: ₹${(batch.commission_amount_paise / 100).toFixed(2)}`);
      console.log(`  Net Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
      console.log(`  Transaction Count: ${batch.transaction_count}`);
      console.log(`  Created: ${batch.created_at}`);
      console.log('');

      totalGross += parseInt(batch.gross_amount_paise);
      totalTds += parseInt(batch.tds_amount_paise);
      totalCommission += parseInt(batch.commission_amount_paise);
      totalNet += parseInt(batch.net_amount_paise);
      totalTxnCount += parseInt(batch.transaction_count);
    });

    console.log('TOTALS:');
    console.log(`  Total Gross: ₹${(totalGross / 100).toFixed(2)}`);
    console.log(`  Total TDS: ₹${(totalTds / 100).toFixed(2)}`);
    console.log(`  Total Commission/MDR: ₹${(totalCommission / 100).toFixed(2)}`);
    console.log(`  Total Net Payable: ₹${(totalNet / 100).toFixed(2)}`);
    console.log(`  Total Transactions: ${totalTxnCount}`);
    console.log('');

    // 2. Settlement Items Breakdown
    console.log('2. SETTLEMENT ITEMS BREAKDOWN');
    console.log('-----------------------------');
    const items = await client.query(`
      SELECT
        settlement_batch_id,
        COUNT(*) as item_count,
        SUM(amount_paise) as total_amount
      FROM sp_v2_settlement_items
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
      GROUP BY settlement_batch_id
    `);

    items.rows.forEach((item, i) => {
      console.log(`Batch ${item.settlement_batch_id}:`);
      console.log(`  Items: ${item.item_count}`);
      console.log(`  Total Amount: ₹${(item.total_amount / 100).toFixed(2)}`);
    });
    console.log('');

    // 3. Transaction Status Distribution
    console.log('3. TRANSACTION STATUS DISTRIBUTION');
    console.log('----------------------------------');
    const txnStatus = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_paise
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-27'
      GROUP BY status
      ORDER BY count DESC
    `);

    txnStatus.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} txns, ₹${(row.total_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // 4. Bank Transfers (if any)
    console.log('4. BANK TRANSFERS');
    console.log('-----------------');
    const transfers = await client.query(`
      SELECT
        id,
        settlement_batch_id,
        status,
        amount_paise,
        bank_reference,
        initiated_at,
        completed_at
      FROM sp_v2_bank_transfers
      WHERE settlement_batch_id IN (
        SELECT id FROM sp_v2_settlement_batches
        WHERE DATE(cycle_date) = '2025-10-27'
      )
    `);

    if (transfers.rowCount > 0) {
      transfers.rows.forEach((transfer, i) => {
        console.log(`Transfer ${i + 1}:`);
        console.log(`  Batch ID: ${transfer.settlement_batch_id}`);
        console.log(`  Status: ${transfer.status}`);
        console.log(`  Amount: ₹${(transfer.amount_paise / 100).toFixed(2)}`);
        console.log(`  Bank Reference: ${transfer.bank_reference || 'N/A'}`);
        console.log(`  Initiated: ${transfer.initiated_at || 'N/A'}`);
        console.log(`  Completed: ${transfer.completed_at || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('  No bank transfers found (batches pending approval)\n');
    }

    // 5. Financial Metrics Summary
    console.log('5. FINANCIAL METRICS SUMMARY');
    console.log('----------------------------');
    const mdrRate = totalGross > 0 ? (totalCommission / totalGross) * 100 : 0;
    const tdsRate = totalGross > 0 ? (totalTds / totalGross) * 100 : 0;
    const netRate = totalGross > 0 ? (totalNet / totalGross) * 100 : 0;

    console.log(`GMV (Gross Merchandise Value): ₹${(totalGross / 100).toFixed(2)}`);
    console.log(`MDR Collected: ₹${(totalCommission / 100).toFixed(2)} (${mdrRate.toFixed(2)}%)`);
    console.log(`TDS Deducted: ₹${(totalTds / 100).toFixed(2)} (${tdsRate.toFixed(2)}%)`);
    console.log(`Net Payable to Merchants: ₹${(totalNet / 100).toFixed(2)} (${netRate.toFixed(2)}%)`);
    console.log(`Transaction Count: ${totalTxnCount}`);
    console.log(`Average Transaction Value: ₹${totalTxnCount > 0 ? ((totalGross / totalTxnCount) / 100).toFixed(2) : 0}`);
    console.log('');

    // 6. Reconciliation Alignment Check
    console.log('6. RECONCILIATION ALIGNMENT CHECK');
    console.log('---------------------------------');
    const settledTxns = await client.query(`
      SELECT
        COUNT(*) as settled_count,
        SUM(amount_paise) as settled_amount
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-27'
      AND status = 'SETTLED'
    `);

    const settledCount = parseInt(settledTxns.rows[0].settled_count);
    const settledAmount = parseInt(settledTxns.rows[0].settled_amount);

    console.log(`Settled Transactions (from sp_v2_transactions): ${settledCount}, ₹${(settledAmount / 100).toFixed(2)}`);
    console.log(`Settlement Batch Transaction Count: ${totalTxnCount}`);
    console.log(`Settlement Batch Gross Amount: ₹${(totalGross / 100).toFixed(2)}`);
    console.log('');

    if (settledCount === totalTxnCount) {
      console.log('✅ Transaction count matches!');
    } else {
      console.log(`⚠️  Transaction count mismatch: ${settledCount} settled vs ${totalTxnCount} in batches`);
    }

    if (settledAmount === totalGross) {
      console.log('✅ Gross amount matches!');
    } else {
      console.log(`⚠️  Amount mismatch: ₹${(settledAmount / 100).toFixed(2)} settled vs ₹${(totalGross / 100).toFixed(2)} in batches`);
    }

    console.log('\n========================================');
    console.log('EXPECTED FINANCIAL DASHBOARD VALUES');
    console.log('========================================\n');

    console.log('Key Metrics:');
    console.log(`  • Total GMV: ₹${(totalGross / 100).toFixed(2)}`);
    console.log(`  • MDR Revenue: ₹${(totalCommission / 100).toFixed(2)}`);
    console.log(`  • TDS Collected: ₹${(totalTds / 100).toFixed(2)}`);
    console.log(`  • Net Payouts: ₹${(totalNet / 100).toFixed(2)}`);
    console.log(`  • Settlement Batches: ${batches.rowCount}`);
    console.log(`  • Pending Approval: ${batches.rows.filter(b => b.status === 'PENDING_APPROVAL').length}`);
    console.log(`  • Sent to Bank: ${batches.rows.filter(b => b.status === 'SENT_TO_BANK').length}`);
    console.log(`  • Credited: ${batches.rows.filter(b => b.status === 'CREDITED').length}`);
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkFinancialData().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
