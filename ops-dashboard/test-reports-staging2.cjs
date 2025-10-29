const API_BASE = 'http://52.66.199.215:5103';

async function testReports() {
  try {
    const date = '2025-10-27';

    console.log('========================================');
    console.log('Testing Reports API on Staging 2');
    console.log(`Date: ${date}`);
    console.log('========================================\n');

    // Test 1: Settlement Summary
    console.log('1. SETTLEMENT SUMMARY REPORT');
    console.log('   Endpoint: GET /reports/settlement-summary');
    const summaryResponse = await fetch(`${API_BASE}/reports/settlement-summary?cycleDate=${date}`);

    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      console.log(`   ✅ Status: ${summaryResponse.status}`);
      console.log(`   Records: ${summaryData.rowCount}`);
      if (summaryData.data && summaryData.data.length > 0) {
        const first = summaryData.data[0];
        console.log(`   First record:`);
        console.log(`     - Cycle Date: ${first.cycleDate}`);
        console.log(`     - Merchant: ${first.merchantName}`);
        console.log(`     - Gross Amount: ₹${first.grossAmountRupees}`);
        console.log(`     - Net Amount: ₹${first.netAmountRupees}`);
        console.log(`     - Txn Count: ${first.transactionCount}`);
        console.log(`     - Status: ${first.status}`);
      }
    } else {
      console.log(`   ❌ Error: ${summaryResponse.status} ${summaryResponse.statusText}`);
    }
    console.log('');

    // Test 2: Settlement Transactions
    console.log('2. SETTLEMENT TRANSACTIONS REPORT');
    console.log('   Endpoint: GET /reports/settlement-transactions');
    const txnResponse = await fetch(`${API_BASE}/reports/settlement-transactions?cycleDate=${date}`);

    if (txnResponse.ok) {
      const txnData = await txnResponse.json();
      console.log(`   ✅ Status: ${txnResponse.status}`);
      console.log(`   Records: ${txnData.rowCount}`);
      if (txnData.data && txnData.data.length > 0) {
        const first = txnData.data[0];
        console.log(`   First transaction:`);
        console.log(`     - Txn ID: ${first.txnId}`);
        console.log(`     - Cycle Date: ${first.cycleDate}`);
        console.log(`     - Merchant: ${first.merchantName}`);
        console.log(`     - Gross Amount: ₹${first.grossAmountRupees}`);
        console.log(`     - Net Settlement: ₹${first.netSettlementRupees}`);
        console.log(`     - UTR: ${first.utr || 'N/A'}`);
      }
    } else {
      console.log(`   ❌ Error: ${txnResponse.status} ${txnResponse.statusText}`);
    }
    console.log('');

    // Test 3: Bank MIS
    console.log('3. BANK MIS REPORT');
    console.log('   Endpoint: GET /reports/bank-mis');
    const bankResponse = await fetch(`${API_BASE}/reports/bank-mis?cycleDate=${date}`);

    if (bankResponse.ok) {
      const bankData = await bankResponse.json();
      console.log(`   ✅ Status: ${bankResponse.status}`);
      console.log(`   Records: ${bankData.rowCount}`);
      if (bankData.data && bankData.data.length > 0) {
        const first = bankData.data[0];
        console.log(`   First record:`);
        console.log(`     - Txn ID: ${first.txnId}`);
        console.log(`     - UTR: ${first.utr || 'N/A'}`);
        console.log(`     - PG Amount: ₹${first.pgAmountRupees}`);
        console.log(`     - Status: ${first.reconStatus}`);
        console.log(`     - Merchant: ${first.merchantName}`);
      }
    } else {
      console.log(`   ❌ Error: ${bankResponse.status} ${bankResponse.statusText}`);
    }
    console.log('');

    // Test 4: Recon Outcome
    console.log('4. RECON OUTCOME REPORT');
    console.log('   Endpoint: GET /reports/recon-outcome');
    const reconResponse = await fetch(`${API_BASE}/reports/recon-outcome?cycleDate=${date}`);

    if (reconResponse.ok) {
      const reconData = await reconResponse.json();
      console.log(`   ✅ Status: ${reconResponse.status}`);
      console.log(`   Records: ${reconData.rowCount}`);
      if (reconData.data && reconData.data.length > 0) {
        const first = reconData.data[0];
        console.log(`   First record:`);
        console.log(`     - Txn ID: ${first.txnId}`);
        console.log(`     - Amount: ₹${first.amountRupees}`);
        console.log(`     - Status: ${first.status}`);
        console.log(`     - Payment Method: ${first.paymentMethod || 'N/A'}`);
        console.log(`     - Exception: ${first.exceptionType || 'None'}`);
      }
    } else {
      console.log(`   ❌ Error: ${reconResponse.status} ${reconResponse.statusText}`);
    }
    console.log('');

    // Test 5: Tax Report
    console.log('5. TAX REPORT');
    console.log('   Endpoint: GET /reports/tax-report');
    const taxResponse = await fetch(`${API_BASE}/reports/tax-report?cycleDate=${date}`);

    if (taxResponse.ok) {
      const taxData = await taxResponse.json();
      console.log(`   ✅ Status: ${taxResponse.status}`);
      console.log(`   Records: ${taxData.rowCount}`);
      if (taxData.data && taxData.data.length > 0) {
        const first = taxData.data[0];
        console.log(`   First record:`);
        console.log(`     - Cycle Date: ${first.cycleDate}`);
        console.log(`     - Merchant: ${first.merchantName}`);
        console.log(`     - Gross Amount: ₹${first.grossAmountRupees}`);
        console.log(`     - Commission: ₹${first.commissionRupees}`);
        console.log(`     - GST Amount: ₹${first.gstAmountRupees}`);
        console.log(`     - Invoice: ${first.invoiceNumber}`);
      }
    } else {
      console.log(`   ❌ Error: ${taxResponse.status} ${taxResponse.statusText}`);
    }
    console.log('');

    console.log('========================================');
    console.log('✅ Reports API Testing Complete');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

testReports().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
