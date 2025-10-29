const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

(async () => {
  try {
    console.log('Inserting 3 test transactions...');
    
    const result = await pool.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, status, 
        transaction_date, transaction_timestamp, payment_method, utr, source_type
      ) VALUES 
        ('PG_TEST_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000) || '_001', 'MERCHANT_001', 60000, 'RECONCILED', CURRENT_DATE, NOW(), 'UPI', 'UTR' || FLOOR(RANDOM() * 1000000000), 'WEBHOOK'),
        ('PG_TEST_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000) || '_002', 'MERCHANT_001', 90000, 'RECONCILED', CURRENT_DATE, NOW(), 'CARD', 'UTR' || FLOOR(RANDOM() * 1000000000), 'WEBHOOK'),
        ('PG_TEST_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000) || '_003', 'MERCHANT_001', 120000, 'RECONCILED', CURRENT_DATE, NOW(), 'UPI', 'UTR' || FLOOR(RANDOM() * 1000000000), 'WEBHOOK')
      RETURNING transaction_id, amount_paise, status
    `);
    
    console.log('✅ Inserted transactions:');
    result.rows.forEach(row => {
      console.log(`  ${row.transaction_id}: ₹${(row.amount_paise / 100).toFixed(2)} (${row.status})`);
    });
    
    console.log('\nAdding to settlement queue...');
    
    for (const txn of result.rows) {
      await pool.query(`
        INSERT INTO sp_v2_settlement_queue (
          transaction_id, merchant_id, amount_paise, status
        ) VALUES ($1, $2, $3, 'PENDING')
      `, [txn.transaction_id, 'MERCHANT_001', txn.amount_paise]);
    }
    
    console.log('✅ Added to settlement queue');
    console.log('\nWaiting for settlement processor to pick up transactions...');
    console.log('(This should happen within 2 minutes)');
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
})();
