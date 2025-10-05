const { mapV1ToV2 } = require('./services/recon-api/utils/v1-column-mapper');

// Test data from actual V1 database
const v1SampleData = [
  {
    transaction_id: '661581002251176056',
    client_code: 'NITH78',
    client_name: null,
    payment_mode: 'Rupay Card',
    pg_pay_mode: 'BOB',
    pg_name: 'SabPaisa',
    payee_amount: 50,
    settlement_amount: 49.52,
    bank_exclude_amount: null,
    transaction_status: 'SUCCESS',
    trans_date: '2025-02-10',
    trans_complete_date: '2025-02-10T18:29:34.000Z',
    utr: null,
    rrn: null
  },
  {
    transaction_id: '853390802250811735',
    client_code: 'SUSH78',
    client_name: null,
    payment_mode: 'Net Banking',
    pg_pay_mode: 'Punjab National Bank Retail',
    pg_name: 'ATOM',
    payee_amount: 12480,
    settlement_amount: 12480,
    bank_exclude_amount: null,
    transaction_status: 'SUCCESS',
    trans_date: '2025-02-08',
    trans_complete_date: '2025-02-08T03:14:09.000Z',
    utr: null,
    rrn: null
  },
  {
    transaction_id: 'UPI123456789',
    client_code: 'TEST01',
    client_name: 'Test Merchant',
    payment_mode: 'UPI',
    pg_pay_mode: 'AIRTEL',
    pg_name: 'SabPaisa',
    payee_amount: 1000,
    settlement_amount: 980,
    bank_exclude_amount: 20,
    transaction_status: 'SUCCESS',
    trans_date: '2025-02-15',
    trans_complete_date: '2025-02-15T10:30:00.000Z',
    utr: 'UTR987654321',
    rrn: null
  }
];

console.log('=== ENHANCED V1 → V2 NORMALIZATION TEST ===\n');

v1SampleData.forEach((v1Record, index) => {
  console.log(`\n📋 Test Case ${index + 1}: ${v1Record.payment_mode}`);
  console.log('─'.repeat(60));
  
  console.log('\n🔵 V1 Input:');
  console.log(`  transaction_id: ${v1Record.transaction_id}`);
  console.log(`  payment_mode: ${v1Record.payment_mode}`);
  console.log(`  pg_pay_mode: ${v1Record.pg_pay_mode}`);
  console.log(`  pg_name: ${v1Record.pg_name}`);
  console.log(`  client_name: ${v1Record.client_name}`);
  console.log(`  payee_amount: ${v1Record.payee_amount}`);
  
  const v2Record = mapV1ToV2(v1Record, 'pg_transactions');
  
  console.log('\n🟢 V2 Output:');
  console.log(`  transaction_id: ${v2Record.transaction_id}`);
  console.log(`  payment_method: ${v2Record.payment_method} ✨ (parsed)`);
  console.log(`  card_network: ${v2Record.card_network} ✨ (extracted)`);
  console.log(`  acquirer_code: ${v2Record.acquirer_code} ✨ (normalized)`);
  console.log(`  gateway_ref: ${v2Record.gateway_ref} ✨ (generated)`);
  console.log(`  merchant_name: ${v2Record.merchant_name}`);
  console.log(`  amount_paise: ${v2Record.amount_paise} (${v1Record.payee_amount} × 100)`);
  
  console.log('\n✅ Enrichment Result:');
  const hasCardNetwork = v2Record.card_network ? '✓' : '✗';
  const hasAcquirer = v2Record.acquirer_code ? '✓' : '✗';
  const hasGatewayRef = v2Record.gateway_ref ? '✓' : '✗';
  const hasPaymentMethod = v2Record.payment_method ? '✓' : '✗';
  
  console.log(`  ${hasCardNetwork} card_network enriched`);
  console.log(`  ${hasAcquirer} acquirer_code enriched`);
  console.log(`  ${hasGatewayRef} gateway_ref enriched`);
  console.log(`  ${hasPaymentMethod} payment_method parsed correctly`);
});

console.log('\n\n=== VALIDATION ===\n');

const testResults = v1SampleData.map(v1 => {
  const v2 = mapV1ToV2(v1, 'pg_transactions');
  // Payment method should be normalized (CARD, UPI, NETBANKING, not original value)
  const isParsed = ['CARD', 'UPI', 'NETBANKING', 'WALLET'].includes(v2.payment_method);
  return {
    payment_mode: v1.payment_mode,
    v2_method: v2.payment_method,
    payment_method_ok: isParsed,
    has_card_network: !!v2.card_network,
    needs_card_network: v1.payment_mode.toLowerCase().includes('card') || v1.payment_mode.toLowerCase().includes('upi'),
    has_acquirer: !!v2.acquirer_code,
    has_gateway_ref: !!v2.gateway_ref
  };
});

console.log('Payment Mode → Payment Method Parsing:');
testResults.forEach(r => {
  const status = r.payment_method_ok ? '✅' : '❌';
  console.log(`  ${status} "${r.payment_mode}" → "${r.v2_method}"`);
});

console.log('\nCard Network Extraction:');
testResults.forEach(r => {
  const status = (r.has_card_network && r.needs_card_network) || (!r.has_card_network && !r.needs_card_network) ? '✅' : '❌';
  const result = r.has_card_network ? 'extracted' : 'N/A (not a card/UPI transaction)';
  console.log(`  ${status} "${r.payment_mode}" → ${result}`);
});

console.log('\nAcquirer Code Normalization:');
testResults.forEach(r => {
  const status = r.has_acquirer ? '✅' : '❌';
  console.log(`  ${status} acquirer_code ${r.has_acquirer ? 'normalized' : 'missing'}`);
});

console.log('\nGateway Reference Generation:');
testResults.forEach(r => {
  const status = r.has_gateway_ref ? '✅' : '❌';
  console.log(`  ${status} gateway_ref ${r.has_gateway_ref ? 'generated' : 'missing'}`);
});

const allPassed = testResults.every(r => 
  r.payment_method_ok && r.has_acquirer && r.has_gateway_ref &&
  (r.needs_card_network ? r.has_card_network : true)
);

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('🎉 ALL TESTS PASSED! Enhanced normalization is working correctly.');
} else {
  console.log('⚠️  Some tests failed. Please review the results above.');
}
console.log('='.repeat(60));
