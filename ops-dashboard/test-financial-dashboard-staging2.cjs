const API_BASE = 'http://52.66.199.215:5108'; // Overview API port

async function testFinancialDashboard() {
  try {
    const from = '2025-10-27';
    const to = '2025-10-27';
    const groupBy = 'day';

    console.log('========================================');
    console.log('Testing Financial Dashboard API on Staging 2');
    console.log(`Date Range: ${from} to ${to}`);
    console.log('========================================\n');

    console.log('FINANCIAL ANALYTICS');
    console.log(`Endpoint: GET /api/analytics/financial?from=${from}&to=${to}&groupBy=${groupBy}`);

    const response = await fetch(`${API_BASE}/api/analytics/financial?from=${from}&to=${to}&groupBy=${groupBy}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Status: ${response.status}\n`);

      // Period Info
      console.log('PERIOD:');
      console.log(`  From: ${data.period.from}`);
      console.log(`  To: ${data.period.to}`);
      console.log(`  Days: ${data.period.days}`);
      console.log('');

      // Summary Metrics
      console.log('SUMMARY METRICS:');
      console.log(`  GMV: ${data.summary.gmv.formatted} (${data.summary.gmv.paise} paise)`);
      console.log(`  MDR Collected: ${data.summary.mdrCollected.formatted}`);
      console.log(`  Bank Charges Paid: ${data.summary.bankChargesPaid.formatted}`);
      console.log(`  SettlePaisa Revenue: ${data.summary.settlepaisaRevenue.formatted}`);
      console.log(`  Gross Margin: ${data.summary.grossMarginPercent.toFixed(2)}%`);
      console.log(`  Net Settled: ${data.summary.netSettled.formatted}`);
      console.log(`  Transaction Count: ${data.summary.transactionCount}`);
      console.log(`  Merchant Count: ${data.summary.merchantCount}`);
      console.log(`  Batch Count: ${data.summary.batchCount}`);
      console.log(`  Avg Transaction Value: ₹${data.summary.avgTransactionValue.rupees}`);
      console.log('');

      // Deltas
      if (data.deltas) {
        console.log('DELTAS (vs previous period):');
        console.log(`  GMV: ${data.deltas.gmvPct ? data.deltas.gmvPct.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  MDR: ${data.deltas.mdrPct ? data.deltas.mdrPct.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  Bank Charges: ${data.deltas.bankChargesPct ? data.deltas.bankChargesPct.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  Revenue: ${data.deltas.revenuePct ? data.deltas.revenuePct.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  Margin: ${data.deltas.marginPct ? data.deltas.marginPct.toFixed(2) + '%' : 'N/A'}`);
        console.log(`  Net Settled: ${data.deltas.netSettledPct ? data.deltas.netSettledPct.toFixed(2) + '%' : 'N/A'}`);
        console.log('');
      }

      // Trends
      if (data.trends && data.trends.length > 0) {
        console.log('TRENDS:');
        console.log(`  Data Points: ${data.trends.length}`);
        console.log('  First data point:');
        const first = data.trends[0];
        console.log(`    Date: ${first.date}`);
        console.log(`    GMV: ₹${(parseInt(first.gmv) / 100).toFixed(2)}`);
        console.log(`    MDR: ₹${(parseInt(first.mdr) / 100).toFixed(2)}`);
        console.log(`    Bank Charges: ₹${(parseInt(first.bankCharges) / 100).toFixed(2)}`);
        console.log(`    Revenue: ₹${(parseInt(first.revenue) / 100).toFixed(2)}`);
        console.log(`    Margin: ${first.marginPercent.toFixed(2)}%`);
        console.log(`    Txn Count: ${first.txnCount}`);
        console.log('');
      }

      console.log('========================================');
      console.log('✅ Financial Dashboard API Test Complete');
      console.log('========================================');

    } else {
      const errorText = await response.text();
      console.log(`❌ Error: ${response.status} ${response.statusText}`);
      console.log(`Response: ${errorText}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

testFinancialDashboard().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
