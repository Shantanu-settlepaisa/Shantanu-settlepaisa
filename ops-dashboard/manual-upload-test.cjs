const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function manualUpload() {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('📤 Manual upload: Inserting PG transactions...');
    
    const pgTransactions = [
      {txnId: 'TXN20251009001', merchant: 'MERCH001', amount: 100000, utr: 'UTR20251009001', mode: 'UPI'},
      {txnId: 'TXN20251009002', merchant: 'MERCH001', amount: 250050, utr: 'UTR20251009002', mode: 'NETBANKING'},
      {txnId: 'TXN20251009003', merchant: 'MERCH001', amount: 75000, utr: 'UTR20251009003', mode: 'UPI'},
      {txnId: 'TXN20251009004', merchant: 'MERCH001', amount: 320000, utr: 'UTR20251009004', mode: 'CARD'},
      {txnId: 'TXN20251009005', merchant: 'MERCH001', amount: 150000, utr: 'UTR20251009005', mode: 'UPI'},
      {txnId: 'TXN20251009006', merchant: 'MERCH001', amount: 450000, utr: 'UTR20251009006', mode: 'NETBANKING'},
      {txnId: 'TXN20251009007', merchant: 'MERCH001', amount: 89050, utr: 'UTR20251009007', mode: 'UPI'},
      {txnId: 'TXN20251009008', merchant: 'MERCH001', amount: 210000, utr: 'UTR20251009008', mode: 'UPI'},
      {txnId: 'TXN20251009009', merchant: 'MERCH001', amount: 670000, utr: 'UTR20251009009', mode: 'CARD'},
      {txnId: 'TXN20251009010', merchant: 'MERCH001', amount: 125075, utr: 'UTR20251009010', mode: 'UPI'}
    ];

    for (const txn of pgTransactions) {
      await pool.query(`
        INSERT INTO sp_v2_transactions (
          transaction_id, merchant_id, amount_paise, currency,
          transaction_date, transaction_timestamp,
          source_type, source_name, payment_method, utr, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (transaction_id) DO NOTHING
      `, [
        txn.txnId, txn.merchant, txn.amount, 'INR',
        '2025-10-09', '2025-10-09 10:00:00',
        'MANUAL_UPLOAD', 'MANUAL_UPLOAD', txn.mode, txn.utr, 'PENDING'
      ]);
    }
    console.log(`✓ Inserted ${pgTransactions.length} PG transactions`);

    console.log('\n📤 Manual upload: Inserting Bank statements...');
    const bankStatements = [
      {ref: 'BANK20251009001', utr: 'UTR20251009001', amount: 100000},
      {ref: 'BANK20251009002', utr: 'UTR20251009002', amount: 250050},
      {ref: 'BANK20251009003', utr: 'UTR20251009003', amount: 75000},
      {ref: 'BANK20251009004', utr: 'UTR20251009004', amount: 320000},
      {ref: 'BANK20251009005', utr: 'UTR20251009005', amount: 150000},
      {ref: 'BANK20251009006', utr: 'UTR20251009006', amount: 450000},
      {ref: 'BANK20251009007', utr: 'UTR20251009007', amount: 89050},
      {ref: 'BANK20251009008', utr: 'UTR20251009008', amount: 210000},
      {ref: 'BANK20251009009', utr: 'UTR20251009009', amount: 670000},
      {ref: 'BANK20251009010', utr: 'UTR20251009010', amount: 125075}
    ];

    for (const stmt of bankStatements) {
      await pool.query(`
        INSERT INTO sp_v2_bank_statements (
          bank_ref, bank_name, amount_paise, transaction_date, value_date,
          utr, remarks, debit_credit, source_type, source_file, processed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (bank_ref) DO NOTHING
      `, [
        stmt.ref, 'AXIS_BANK', stmt.amount, '2025-10-09', '2025-10-09',
        stmt.utr, 'Payment received', 'CREDIT', 'MANUAL_UPLOAD', 'MANUAL_UPLOAD', false
      ]);
    }
    console.log(`✓ Inserted ${bankStatements.length} bank statements`);

    // Verify insertion
    const pgCount = await pool.query(`
      SELECT COUNT(*) FROM sp_v2_transactions 
      WHERE transaction_date = '2025-10-09' AND source_type = 'MANUAL_UPLOAD'
    `);
    const bankCount = await pool.query(`
      SELECT COUNT(*) FROM sp_v2_bank_statements 
      WHERE transaction_date = '2025-10-09' AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log(`\n✅ Upload complete:`);
    console.log(`   PG transactions: ${pgCount.rows[0].count}`);
    console.log(`   Bank statements: ${bankCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

manualUpload().catch(console.error);
