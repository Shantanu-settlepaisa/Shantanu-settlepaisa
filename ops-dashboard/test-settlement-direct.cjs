const { SettlementCalculatorV1Logic } = require('./services/settlement-engine/settlement-calculator-v1-logic.cjs');

async function testSettlement() {
  const calculator = new SettlementCalculatorV1Logic();
  
  const testTransactions = [
    {
      transaction_id: 'PG20251001001',
      paid_amount: 50000,
      payee_amount: 50000,
      payment_mode: 'NEFT',
      paymode_id: 1
    },
    {
      transaction_id: 'PG20251001002',
      paid_amount: 75000,
      payee_amount: 75000,
      payment_mode: 'RTGS',
      paymode_id: 2
    }
  ];
  
  console.log('Testing settlement calculation for UNIV99...\n');
  
  try {
    const batch = await calculator.calculateSettlement(
      'UNIV99',
      testTransactions,
      '2025-10-01'
    );
    
    console.log('Settlement Batch Result:');
    console.log(JSON.stringify(batch, null, 2));
    
    const batchId = await calculator.persistSettlement(batch);
    console.log('\n✅ Settlement persisted with ID:', batchId);
    
    await calculator.close();
  } catch (error) {
    console.error('❌ Settlement failed:', error.message);
    console.error(error.stack);
  }
}

testSettlement();
