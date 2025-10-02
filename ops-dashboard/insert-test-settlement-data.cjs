const { Pool } = require('pg');

const sabpaisaPool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'settlepaisa',
  password: 'sabpaisa123',
  port: 5432,
});

async function insertTestData() {
  const client = await sabpaisaPool.connect();
  
  try {
    console.log('🔄 Inserting test data into SabPaisa staging DB...\n');
    
    // Test merchants (already exist in staging)
    const testMerchants = ['UNIV99', 'MURA86', 'NISP83'];
    
    const testDate = '2025-10-01';
    
    // Insert 10 test transactions
    for (let i = 1; i <= 10; i++) {
      const merchantCode = testMerchants[i % testMerchants.length];
      const amount = (Math.random() * 90000 + 10000).toFixed(2); // ₹100 to ₹1000
      const paymodeId = [1, 2, 3, 6][i % 4]; // Debit, Credit, NetBanking, UPI
      const paymodeName = ['Debit Card', 'Credit Card', 'Net Banking', 'UPI'][i % 4];
      
      const transactionId = `TEST_TXN_${Date.now()}_${i}`;
      const utr = `UTR${Date.now()}${i}`;
      
      // Calculate charges (2% EP charge, 18% GST)
      const epCharge = (parseFloat(amount) * 0.02).toFixed(2);
      const gst = (parseFloat(epCharge) * 0.18).toFixed(2);
      
      // Insert into transactions_to_settle
      await client.query(`
        INSERT INTO transactions_to_settle (
          transaction_id, client_code, paid_amount, payee_amount,
          payment_mode, transaction_mode, transaction_status,
          trans_complete_date, convcharges, ep_charges, gst,
          Payment_mode, settlement_utr, bank_name, bank_txn_id,
          is_recon, is_bank_matched
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        transactionId,
        merchantCode,
        parseFloat(amount),
        parseFloat(amount),
        paymodeName,
        'online',
        'SUCCESS',
        testDate,
        0, // conv charges
        parseFloat(epCharge),
        parseFloat(gst),
        paymodeId,
        utr,
        'SBI',
        `BANK_${transactionId}`,
        null, // not reconciled yet
        null  // not matched yet
      ]);
      
      // Insert matching bank statement
      await client.query(`
        INSERT INTO transaction_bank (
          transaction_id, bank_name, utr, amount,
          transaction_date, status, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        transactionId,
        'SBI',
        utr,
        parseFloat(amount),
        testDate,
        'SUCCESS',
        `Test bank credit for ${merchantCode}`
      ]);
      
      console.log(`✅ Inserted transaction ${i}/10: ${transactionId} for ${merchantCode} - ₹${amount}`);
    }
    
    console.log('\n✅ Test data inserted successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - 10 test transactions created`);
    console.log(`  - Date: ${testDate}`);
    console.log(`  - Merchants: ${testMerchants.join(', ')}`);
    console.log(`  - Payment modes: Debit/Credit/NetBanking/UPI`);
    console.log('\n🚀 Next Step: Run reconciliation in V2 UI');
    console.log('   → http://localhost:5174/ops/overview');
    console.log('   → Use date: 2025-10-01');
    console.log('   → Settlement will auto-calculate after recon completes');
    
  } catch (error) {
    console.error('❌ Error inserting test data:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await sabpaisaPool.end();
  }
}

insertTestData();
