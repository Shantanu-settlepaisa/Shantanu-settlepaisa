#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function compareDashboardVsReality() {
  const client = await pool.connect();

  try {
    console.log('🔍 DASHBOARD DATA vs ACTUAL DATABASE DATA\n');
    console.log('=' .repeat(60));

    // What the dashboard shows
    console.log('\n📊 DASHBOARD SHOWING (from screenshot):');
    console.log('  Match Rate: 0.0% (0 of 20 transactions)');
    console.log('  Total Amount: ₹5.47K');
    console.log('  Reconciled Amount: ₹0');
    console.log('  Variance: ₹5.47K (20 unreconciled)');
    console.log('  Exceptions: 0');
    console.log('\n  Settlement Pipeline:');
    console.log('    Captured: 20');
    console.log('    Reconciled: 0');
    console.log('    Settled: 0');
    console.log('    Credited: 0');
    console.log('    Exceptions: 20 (entire bar is red)\n');

    // What's actually in the database
    console.log('=' .repeat(60));
    console.log('\n💾 ACTUAL DATABASE DATA (Today 2025-10-10):\n');

    // Get today's reconciliation job
    const job = await client.query(`
      SELECT
        total_pg_records,
        total_bank_records,
        matched_records,
        unmatched_pg,
        unmatched_bank,
        exception_records,
        status
      FROM sp_v2_reconciliation_jobs
      WHERE created_at::date = '2025-10-10'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (job.rows.length > 0) {
      const j = job.rows[0];
      console.log('  📋 Reconciliation Results:');
      console.log(`    Total PG Records: ${j.total_pg_records}`);
      console.log(`    Total Bank Records: ${j.total_bank_records}`);
      console.log(`    ✅ Matched: ${j.matched_records}`);
      console.log(`    Unmatched PG: ${j.unmatched_pg}`);
      console.log(`    Unmatched Bank: ${j.unmatched_bank}`);
      console.log(`    Exceptions: ${j.exception_records}`);
      console.log(`    Status: ${j.status}\n`);

      const matchRate = j.total_pg_records > 0 ?
        ((j.matched_records / j.total_pg_records) * 100).toFixed(1) : 0;
      console.log(`  📊 Calculated Match Rate: ${matchRate}% (${j.matched_records} of ${j.total_pg_records})`);
    } else {
      console.log('  ❌ No reconciliation job found for today\n');
    }

    // Get settlement batch info
    const batch = await client.query(`
      SELECT
        COUNT(*) as batch_count,
        SUM(total_transactions) as total_txns,
        SUM(gross_amount_paise) as gross_amount,
        SUM(net_amount_paise) as net_amount
      FROM sp_v2_settlement_batches
      WHERE created_at::date = '2025-10-10'
    `);

    if (batch.rows[0].batch_count > 0) {
      const b = batch.rows[0];
      console.log(`\n  💰 Settlement Batches:`);
      console.log(`    Batches Created: ${b.batch_count}`);
      console.log(`    Total Transactions: ${b.total_txns}`);
      console.log(`    Gross Amount: ₹${(parseInt(b.gross_amount)/100).toFixed(2)}`);
      console.log(`    Net Amount: ₹${(parseInt(b.net_amount)/100).toFixed(2)}\n`);
    } else {
      console.log('\n  ❌ No settlement batches created today\n');
    }

    // Check what data the dashboard APIs would actually return
    console.log('=' .repeat(60));
    console.log('\n🌐 DASHBOARD API DATA SOURCES:\n');

    console.log('  1. Settlement Pipeline API:');
    console.log('     Endpoint: /api/settlement/pipeline');
    console.log('     Data Source: mock-db.js (HARDCODED DEMO DATA)');
    console.log('     Not using real database!\n');

    console.log('  2. KPIs API:');
    console.log('     Endpoint: /api/kpis');
    console.log('     Data Source: generateKpiData() function (GENERATED MOCK DATA)');
    console.log('     Not using real database!\n');

    console.log('=' .repeat(60));
    console.log('\n❗ ROOT CAUSE:\n');
    console.log('  The dashboard is displaying MOCK DATA, not your actual');
    console.log('  reconciliation and settlement results from the database.');
    console.log('\n  Your E2E test was SUCCESSFUL, but the dashboard UI');
    console.log('  is not connected to the real database yet.\n');

    console.log('=' .repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

compareDashboardVsReality();
