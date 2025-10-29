const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function traceCompleteDataFlow() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         COMPLETE DATA FLOW TRACE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const jobId = '1e4a6923-ebab-42c6-877c-1930b4dc848f';

    // STEP 1: Check reconciliation job
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: RECONCILIATION JOB RECORD');
    console.log('Table: sp_v2_reconciliation_jobs');
    console.log('═══════════════════════════════════════════════════════════');

    const job = await pool.query(`
      SELECT
        job_id,
        job_name,
        date_from,
        date_to,
        total_pg_records,
        total_bank_records,
        matched_records,
        unmatched_pg,
        unmatched_bank,
        exception_records,
        status,
        processing_start,
        processing_end
      FROM sp_v2_reconciliation_jobs
      WHERE job_id = $1
    `, [jobId]);

    if (job.rows.length > 0) {
      const j = job.rows[0];
      console.log('✅ Job Created:');
      console.log(`   Job ID: ${j.job_id}`);
      console.log(`   Job Name: ${j.job_name}`);
      console.log(`   Date Range: ${j.date_from} to ${j.date_to}`);
      console.log(`   Total PG Records: ${j.total_pg_records}`);
      console.log(`   Total Bank Records: ${j.total_bank_records}`);
      console.log(`   Matched: ${j.matched_records}`);
      console.log(`   Unmatched PG: ${j.unmatched_pg}`);
      console.log(`   Unmatched Bank: ${j.unmatched_bank}`);
      console.log(`   Exceptions: ${j.exception_records}`);
      console.log(`   Status: ${j.status}`);
      console.log(`   Started: ${j.processing_start}`);
      console.log(`   Ended: ${j.processing_end}`);
      console.log(`   Duration: ${(new Date(j.processing_end) - new Date(j.processing_start))}ms`);
    }

    // STEP 2: Check transactions table
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 2: TRANSACTIONS INSERTED/UPDATED');
    console.log('Table: sp_v2_transactions');
    console.log('═══════════════════════════════════════════════════════════');

    const txns = await pool.query(`
      SELECT
        id,
        transaction_id,
        merchant_id,
        amount_paise,
        source_type,
        payment_method,
        utr,
        status,
        settlement_batch_id,
        created_at,
        updated_at
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%'
      ORDER BY id
    `);

    console.log(`✅ Inserted ${txns.rows.length} transactions`);
    console.log(`   First Insert Time: ${txns.rows[0]?.created_at}`);
    console.log(`   Last Updated Time: ${txns.rows[txns.rows.length - 1]?.updated_at}`);
    console.log('\nStatus Breakdown:');

    const statusBreakdown = {};
    txns.rows.forEach(t => {
      statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;
    });

    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} transactions`);
    });

    console.log('\nSample Transactions (first 3):');
    txns.rows.slice(0, 3).forEach(t => {
      console.log(`   - ${t.transaction_id}: ₹${(t.amount_paise / 100).toFixed(2)} | ${t.status} | Batch: ${t.settlement_batch_id || 'NULL'}`);
    });

    // STEP 3: Check bank statements table
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 3: BANK STATEMENTS INSERTED');
    console.log('Table: sp_v2_bank_statements');
    console.log('═══════════════════════════════════════════════════════════');

    const bankStmts = await pool.query(`
      SELECT
        id,
        bank_ref,
        bank_name,
        amount_paise,
        transaction_date,
        utr,
        debit_credit,
        source_type,
        processed,
        created_at
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'UTR_E2E%'
      ORDER BY id
    `);

    console.log(`✅ Inserted ${bankStmts.rows.length} bank statements`);
    console.log(`   First Insert Time: ${bankStmts.rows[0]?.created_at}`);
    console.log('\nProcessed Status:');
    const processedCount = bankStmts.rows.filter(b => b.processed).length;
    const unprocessedCount = bankStmts.rows.filter(b => !b.processed).length;
    console.log(`   Processed: ${processedCount}`);
    console.log(`   Unprocessed: ${unprocessedCount}`);

    console.log('\nSample Bank Statements (first 3):');
    bankStmts.rows.slice(0, 3).forEach(b => {
      console.log(`   - ${b.utr}: ₹${(b.amount_paise / 100).toFixed(2)} | ${b.bank_name} | Processed: ${b.processed}`);
    });

    // STEP 4: Check reconciliation results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 4: RECONCILIATION RESULTS');
    console.log('Table: sp_v2_reconciliation_results');
    console.log('═══════════════════════════════════════════════════════════');

    const reconResults = await pool.query(`
      SELECT
        id,
        job_id,
        pg_transaction_id,
        bank_statement_id,
        match_status,
        match_score,
        pg_amount_paise,
        bank_amount_paise,
        variance_paise,
        exception_reason_code,
        exception_severity,
        created_at
      FROM sp_v2_reconciliation_results
      WHERE job_id = $1
      ORDER BY created_at
    `, [jobId]);

    console.log(`✅ Inserted ${reconResults.rows.length} reconciliation results`);
    console.log(`   Insert Time: ${reconResults.rows[0]?.created_at}`);

    const matchStatusBreakdown = {};
    reconResults.rows.forEach(r => {
      matchStatusBreakdown[r.match_status] = (matchStatusBreakdown[r.match_status] || 0) + 1;
    });

    console.log('\nMatch Status Breakdown:');
    Object.entries(matchStatusBreakdown).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} results`);
    });

    console.log('\nSample Results (first 3 MATCHED):');
    reconResults.rows.filter(r => r.match_status === 'MATCHED').slice(0, 3).forEach(r => {
      console.log(`   - ${r.pg_transaction_id}: PG ₹${(r.pg_amount_paise / 100).toFixed(2)} = Bank ₹${(r.bank_amount_paise / 100).toFixed(2)} | Variance: ₹${(r.variance_paise / 100).toFixed(2)}`);
    });

    // STEP 5: Check settlement batch
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 5: SETTLEMENT BATCH CREATED');
    console.log('Table: sp_v2_settlement_batches');
    console.log('═══════════════════════════════════════════════════════════');

    const batch = await pool.query(`
      SELECT
        id,
        merchant_id,
        merchant_name,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        total_reserve_paise,
        net_amount_paise,
        status,
        created_at,
        updated_at
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH_ABC'
        AND created_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (batch.rows.length > 0) {
      const b = batch.rows[0];
      console.log('✅ Settlement Batch Created:');
      console.log(`   Batch ID: ${b.id}`);
      console.log(`   Merchant ID: ${b.merchant_id}`);
      console.log(`   Merchant Name: ${b.merchant_name}`);
      console.log(`   Cycle Date: ${b.cycle_date}`);
      console.log(`   Total Transactions: ${b.total_transactions}`);
      console.log(`   Gross Amount: ₹${(b.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`   Commission: ₹${(b.total_commission_paise / 100).toFixed(2)}`);
      console.log(`   GST: ₹${(b.total_gst_paise / 100).toFixed(2)}`);
      console.log(`   Reserve: ₹${(b.total_reserve_paise / 100).toFixed(2)}`);
      console.log(`   Net Amount: ₹${(b.net_amount_paise / 100).toFixed(2)}`);
      console.log(`   Status: ${b.status}`);
      console.log(`   Created At: ${b.created_at}`);

      const batchId = b.id;

      // STEP 6: Check settlement items
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('STEP 6: SETTLEMENT ITEMS CREATED');
      console.log('Table: sp_v2_settlement_items');
      console.log('═══════════════════════════════════════════════════════════');

      const items = await pool.query(`
        SELECT
          id,
          settlement_batch_id,
          transaction_id,
          amount_paise,
          commission_paise,
          gst_paise,
          reserve_paise,
          net_paise,
          payment_mode,
          fee_bearer,
          created_at
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
        ORDER BY created_at
      `, [batchId]);

      console.log(`✅ Inserted ${items.rows.length} settlement items`);
      console.log(`   Insert Time: ${items.rows[0]?.created_at}`);

      // Calculate totals
      let totalGross = 0, totalCommission = 0, totalGST = 0, totalNet = 0;
      items.rows.forEach(item => {
        totalGross += item.amount_paise;
        totalCommission += item.commission_paise;
        totalGST += item.gst_paise;
        totalNet += item.net_paise;
      });

      console.log('\nAggregated Totals:');
      console.log(`   Total Gross: ₹${(totalGross / 100).toFixed(2)}`);
      console.log(`   Total Commission: ₹${(totalCommission / 100).toFixed(2)}`);
      console.log(`   Total GST: ₹${(totalGST / 100).toFixed(2)}`);
      console.log(`   Total Net: ₹${(totalNet / 100).toFixed(2)}`);

      console.log('\nSample Settlement Items (first 3):');
      items.rows.slice(0, 3).forEach(item => {
        console.log(`   - ${item.transaction_id}:`);
        console.log(`     Gross: ₹${(item.amount_paise / 100).toFixed(2)}, Commission: ₹${(item.commission_paise / 100).toFixed(2)}, GST: ₹${(item.gst_paise / 100).toFixed(2)}, Net: ₹${(item.net_paise / 100).toFixed(2)}`);
        console.log(`     Payment Mode: ${item.payment_mode}, Fee Bearer: ${item.fee_bearer}`);
      });

      // STEP 7: Check transaction linkage
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('STEP 7: TRANSACTIONS LINKED TO SETTLEMENT BATCH');
      console.log('Table: sp_v2_transactions (UPDATE)');
      console.log('═══════════════════════════════════════════════════════════');

      const linkedTxns = await pool.query(`
        SELECT
          transaction_id,
          amount_paise,
          status,
          settlement_batch_id,
          updated_at
        FROM sp_v2_transactions
        WHERE settlement_batch_id = $1
        ORDER BY transaction_id
      `, [batchId]);

      console.log(`✅ Updated ${linkedTxns.rows.length} transactions with settlement_batch_id`);
      console.log(`   Update Time: ${linkedTxns.rows[0]?.updated_at}`);
      console.log(`   Settlement Batch ID: ${batchId}`);

      console.log('\nLinked Transactions (first 5):');
      linkedTxns.rows.slice(0, 5).forEach(txn => {
        console.log(`   - ${txn.transaction_id}: ₹${(txn.amount_paise / 100).toFixed(2)} | Status: ${txn.status}`);
      });
    }

    // STEP 8: Timeline Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('STEP 8: COMPLETE TIMELINE');
    console.log('═══════════════════════════════════════════════════════════');

    const timeline = await pool.query(`
      WITH events AS (
        SELECT 'Recon Job Created' as event, processing_start as timestamp
        FROM sp_v2_reconciliation_jobs WHERE job_id = $1
        UNION ALL
        SELECT 'Transactions Inserted', MIN(created_at)
        FROM sp_v2_transactions WHERE transaction_id LIKE 'TXN_E2E%'
        UNION ALL
        SELECT 'Bank Statements Inserted', MIN(created_at)
        FROM sp_v2_bank_statements WHERE utr LIKE 'UTR_E2E%'
        UNION ALL
        SELECT 'Recon Results Saved', MIN(created_at)
        FROM sp_v2_reconciliation_results WHERE job_id = $1
        UNION ALL
        SELECT 'Recon Job Completed', processing_end
        FROM sp_v2_reconciliation_jobs WHERE job_id = $1
        UNION ALL
        SELECT 'Settlement Batch Created', created_at
        FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH_ABC'
          AND created_at >= NOW() - INTERVAL '15 minutes'
        ORDER BY created_at DESC LIMIT 1
        UNION ALL
        SELECT 'Settlement Items Created', MIN(created_at)
        FROM sp_v2_settlement_items WHERE settlement_batch_id IN (
          SELECT id FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH_ABC'
          AND created_at >= NOW() - INTERVAL '15 minutes'
          ORDER BY created_at DESC LIMIT 1
        )
        UNION ALL
        SELECT 'Transactions Linked', MAX(updated_at)
        FROM sp_v2_transactions WHERE settlement_batch_id IS NOT NULL
          AND transaction_id LIKE 'TXN_E2E%'
      )
      SELECT event, timestamp FROM events ORDER BY timestamp
    `, [jobId]);

    let baseTime = null;
    timeline.rows.forEach((event, idx) => {
      if (idx === 0) {
        baseTime = new Date(event.timestamp);
        console.log(`\n${idx + 1}. ${event.event}`);
        console.log(`   Time: ${event.timestamp}`);
        console.log(`   Offset: +0ms (baseline)`);
      } else {
        const offset = new Date(event.timestamp) - baseTime;
        console.log(`\n${idx + 1}. ${event.event}`);
        console.log(`   Time: ${event.timestamp}`);
        console.log(`   Offset: +${offset}ms from start`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ DATA FLOW TRACE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

traceCompleteDataFlow();
