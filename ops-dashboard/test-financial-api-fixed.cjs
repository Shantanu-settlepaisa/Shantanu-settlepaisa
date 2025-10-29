const http = require('http');

async function testFinancialAPI() {
  console.log('========================================');
  console.log('TEST FINANCIAL ANALYTICS API (FIXED)');
  console.log('Date: Oct 27, 2025');
  console.log('========================================\n');

  const options = {
    hostname: 'localhost',
    port: 5108,
    path: '/api/analytics/financial?from=2025-10-27&to=2025-10-27',
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);

          console.log('✅ API Response Received\n');

          console.log('==== SUMMARY METRICS ====');
          console.log(`GMV: ${response.summary.gmv.formatted} (${response.summary.gmv.paise} paise)`);
          console.log(`MDR Collected (Total Revenue): ${response.summary.mdrCollected.formatted} (${response.summary.mdrCollected.paise} paise)`);
          console.log(`  └─ Commission: ${response.summary.commission?.formatted || 'N/A'} (${response.summary.commission?.paise || 'N/A'} paise)`);
          console.log(`  └─ GST: ${response.summary.gst?.formatted || 'N/A'} (${response.summary.gst?.paise || 'N/A'} paise)`);
          console.log(`Bank Charges: ${response.summary.bankChargesPaid.formatted} (${response.summary.bankChargesPaid.paise} paise)`);
          console.log(`SettlePaisa Revenue: ${response.summary.settlepaisaRevenue.formatted} (${response.summary.settlepaisaRevenue.paise} paise)`);
          console.log(`Gross Margin: ${response.summary.grossMarginPercent}%`);
          console.log(`Net Settled: ${response.summary.netSettled.formatted} (${response.summary.netSettled.paise} paise)`);
          console.log(`Transaction Count: ${response.summary.transactionCount}`);
          console.log(`Merchant Count: ${response.summary.merchantCount}`);
          console.log(`Batch Count: ${response.summary.batchCount}\n`);

          console.log('==== EXPECTED VALUES ====');
          console.log('GMV: ₹4.38 L (438000 paise)');
          console.log('MDR Collected: ₹10.34 K (10337 paise) [Commission + GST]');
          console.log('  └─ Commission: ₹8.76 K (8760 paise)');
          console.log('  └─ GST: ₹1.58 K (1577 paise)');
          console.log('Bank Charges: ₹0 (0 paise)');
          console.log('SettlePaisa Revenue: ₹8.76 K (8760 paise)');
          console.log('Gross Margin: 2.36%');
          console.log('Net Settled: ₹4.28 L (427663 paise)');
          console.log('Transaction Count: 18');
          console.log('Merchant Count: 1');
          console.log('Batch Count: 1\n');

          console.log('==== VALIDATION ====');
          const gmvCorrect = response.summary.gmv.paise === '438000';
          const mdrCorrect = response.summary.mdrCollected.paise === '10337';
          const gstCorrect = response.summary.gst?.paise === '1577';
          const commissionCorrect = response.summary.commission?.paise === '8760';
          const marginCorrect = response.summary.grossMarginPercent === 2.36;
          const netCorrect = response.summary.netSettled.paise === '427663';
          const txnCountCorrect = response.summary.transactionCount === 18;

          console.log(`  GMV: ${gmvCorrect ? '✅' : '❌'} ${gmvCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  MDR Collected: ${mdrCorrect ? '✅' : '❌'} ${mdrCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  GST: ${gstCorrect ? '✅' : '❌'} ${gstCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  Commission: ${commissionCorrect ? '✅' : '❌'} ${commissionCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  Gross Margin: ${marginCorrect ? '✅' : '❌'} ${marginCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  Net Settled: ${netCorrect ? '✅' : '❌'} ${netCorrect ? 'PASS' : 'FAIL'}`);
          console.log(`  Transaction Count: ${txnCountCorrect ? '✅' : '❌'} ${txnCountCorrect ? 'PASS' : 'FAIL'}\n`);

          const allPass = gmvCorrect && mdrCorrect && gstCorrect && commissionCorrect && marginCorrect && netCorrect && txnCountCorrect;

          console.log('========================================');
          if (allPass) {
            console.log('🎉 ALL TESTS PASSED! FORMULAS FIXED!');
          } else {
            console.log('⚠️  SOME TESTS FAILED - CHECK VALUES');
          }
          console.log('========================================');

          resolve(response);
        } else {
          console.error(`❌ API returned status ${res.statusCode}`);
          console.error(data);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error calling API:', error.message);
      console.error('\nMake sure the Overview API is running on port 5108');
      console.error('Run: cd services/overview-api && npm start');
      reject(error);
    });

    req.end();
  });
}

testFinancialAPI().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
