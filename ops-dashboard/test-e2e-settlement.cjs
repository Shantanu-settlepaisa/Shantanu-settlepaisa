const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

function generateTestData(count, startIndex) {
  const pgTransactions = [];
  const bankStatements = [];
  
  const timestamp = Date.now();
  const today = new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < count; i++) {
    const txnId = `E2E_TEST_${timestamp}_${String(startIndex + i).padStart(3, '0')}`;
    const amount = Math.floor(Math.random() * 5000) + 500; // ₹5 to ₹55
    const utr = `UTR${timestamp}${String(i).padStart(4, '0')}`;
    
    const paymentMethods = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    
    // PG transaction CSV row
    const now = new Date().toISOString();
    pgTransactions.push([
      txnId,
      'MERCHANT_001',
      amount,
      'SUCCESS',
      today,
      now, // transaction_timestamp
      paymentMethod,
      utr,
      'WEBHOOK'
    ].join(','));
    
    // Bank statement CSV row (matching transaction)
    bankStatements.push([
      `BANK_${timestamp}_${String(startIndex + i).padStart(3, '0')}`, // bank_ref
      'ICICI Bank', // bank_name
      amount,
      today,
      today, // value_date
      utr,
      `Payment ${txnId}`, // remarks
      'CREDIT', // debit_credit
      'MANUAL_UPLOAD' // source_type
    ].join(','));
  }
  
  return { pgTransactions, bankStatements };
}

(async () => {
  try {
    console.log('🧪 Starting E2E Settlement Test\n');
    
    // Generate 50 transactions
    console.log('📊 Generating 50 test transactions...');
    const { pgTransactions, bankStatements } = generateTestData(50, 1);
    
    // Create CSV files
    const pgHeader = 'transaction_id,merchant_id,amount_paise,status,transaction_date,transaction_timestamp,payment_method,utr,source_type';
    const bankHeader = 'bank_ref,bank_name,amount_paise,transaction_date,value_date,utr,remarks,debit_credit,source_type';
    
    fs.writeFileSync('test-e2e-pg.csv', pgHeader + '\n' + pgTransactions.join('\n'));
    fs.writeFileSync('test-e2e-bank.csv', bankHeader + '\n' + bankStatements.join('\n'));
    
    console.log('✅ Created test-e2e-pg.csv (50 PG transactions)');
    console.log('✅ Created test-e2e-bank.csv (50 bank statements)\n');
    
    // Get current counts
    const beforeCounts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM sp_v2_transactions WHERE transaction_id LIKE 'E2E_TEST_%') as pg_count,
        (SELECT COUNT(*) FROM sp_v2_bank_statements WHERE bank_ref LIKE 'BANK_%') as bank_count,
        (SELECT COUNT(*) FROM sp_v2_recon_matches) as recon_count,
        (SELECT COUNT(*) FROM sp_v2_settlement_batches) as batch_count,
        (SELECT COUNT(*) FROM sp_v2_settlement_items) as item_count
    `);
    
    console.log('📈 Current database counts:');
    console.log(`   PG Transactions (E2E_TEST): ${beforeCounts.rows[0].pg_count}`);
    console.log(`   Bank Statements: ${beforeCounts.rows[0].bank_count}`);
    console.log(`   Recon Matches: ${beforeCounts.rows[0].recon_count}`);
    console.log(`   Settlement Batches: ${beforeCounts.rows[0].batch_count}`);
    console.log(`   Settlement Items: ${beforeCounts.rows[0].item_count}\n`);
    
    console.log('📤 Next steps:');
    console.log('   1. Upload test-e2e-pg.csv via file upload API');
    console.log('   2. Upload test-e2e-bank.csv via file upload API');
    console.log('   3. Run reconciliation');
    console.log('   4. Verify settlement processing\n');
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
