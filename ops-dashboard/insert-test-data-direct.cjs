#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function insertTestData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert PG transactions directly
    console.log('📊 Inserting PG transactions...');
    const pgTransactions = [
      { id: 'TXN_UP_001', amount: 10000, utr: 'UTR_UP_001', rrn: 'RRN_UP_001' },
      { id: 'TXN_UP_002', amount: 15000, utr: 'UTR_UP_002', rrn: 'RRN_UP_002' },
      { id: 'TXN_UP_003', amount: 20000, utr: 'UTR_UP_003', rrn: 'RRN_UP_003' },
      { id: 'TXN_UP_004', amount: 25000, utr: 'UTR_UP_004', rrn: 'RRN_UP_004' },
      { id: 'TXN_UP_005', amount: 30000, utr: 'UTR_UP_005', rrn: 'RRN_UP_005' },
      { id: 'TXN_UP_006', amount: 35000, utr: 'UTR_UP_006', rrn: 'RRN_UP_006' },
      { id: 'TXN_UP_007', amount: 40000, utr: 'UTR_UP_007', rrn: 'RRN_UP_007' },
      { id: 'TXN_UP_008', amount: 45000, utr: 'UTR_UP_008', rrn: 'RRN_UP_008' },
      { id: 'TXN_UP_009', amount: 50000, utr: 'UTR_UP_009', rrn: 'RRN_UP_009' },
      { id: 'TXN_UP_010', amount: 12000, utr: 'UTR_UP_010', rrn: 'RRN_UP_010' },
    ];

    for (const txn of pgTransactions) {
      await client.query(`
        INSERT INTO sp_v2_transactions
        (transaction_id, merchant_id, amount_paise, utr, rrn, payment_method, status,
         transaction_date, transaction_timestamp, source_type, currency)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (transaction_id) DO NOTHING
      `, [
        txn.id, 'MERCH001', txn.amount, txn.utr, txn.rrn, 'UPI', 'SUCCESS',
        '2025-10-10', '2025-10-10 10:00:00', 'MANUAL_UPLOAD', 'INR'
      ]);
    }

    console.log('✓ Inserted 10 PG transactions');

    // Insert bank statements directly
    console.log('📊 Inserting bank statements...');
    const bankStatements = [
      { ref: 'BANK_UP_001', amount: 10000, utr: 'UTR_UP_001' },
      { ref: 'BANK_UP_002', amount: 15000, utr: 'UTR_UP_002' },
      { ref: 'BANK_UP_003', amount: 20000, utr: 'UTR_UP_003' },
      { ref: 'BANK_UP_004', amount: 25000, utr: 'UTR_UP_004' },
      { ref: 'BANK_UP_005', amount: 30000, utr: 'UTR_UP_005' },
      { ref: 'BANK_UP_006', amount: 35000, utr: 'UTR_UP_006' },
      { ref: 'BANK_UP_007', amount: 40000, utr: 'UTR_UP_007' },
      { ref: 'BANK_UP_008', amount: 45000, utr: 'UTR_UP_008' },
      { ref: 'BANK_UP_009', amount: 50000, utr: 'UTR_UP_009' },
      { ref: 'BANK_UP_010', amount: 12000, utr: 'UTR_UP_010' },
    ];

    for (const stmt of bankStatements) {
      await client.query(`
        INSERT INTO sp_v2_bank_statements
        (bank_ref, bank_name, utr, amount_paise, transaction_date, value_date,
         source_type, debit_credit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
      `, [
        stmt.ref, 'ICICI', stmt.utr, stmt.amount, '2025-10-10', '2025-10-10',
        'MANUAL_UPLOAD', 'CREDIT'
      ]);
    }

    console.log('✓ Inserted 10 bank statements');

    await client.query('COMMIT');
    console.log('\\n✅ Test data inserted successfully!');

    // Verify
    const pgCount = await client.query(`SELECT COUNT(*) FROM sp_v2_transactions WHERE transaction_id LIKE 'TXN_UP_%'`);
    const bankCount = await client.query(`SELECT COUNT(*) FROM sp_v2_bank_statements WHERE bank_ref LIKE 'BANK_UP_%'`);

    console.log(`\\n📊 Verification:`);
    console.log(`  PG Transactions: ${pgCount.rows[0].count}`);
    console.log(`  Bank Statements: ${bankCount.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

insertTestData();
