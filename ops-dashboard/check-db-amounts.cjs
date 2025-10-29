#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-ops-db.cjx7nr1tc5qz.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_ops',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function check() {
  const client = await pool.connect();
  try {
    console.log('=== PG Transactions (first 3) ===');
    const pgResult = await client.query(`
      SELECT transaction_id, utr, amount_paise, gross_amount_paise
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN%'
      ORDER BY transaction_id
      LIMIT 3
    `);
    pgResult.rows.forEach(r => {
      console.log(`TXN: ${r.transaction_id}, UTR: ${r.utr}, amount_paise: ${r.amount_paise}, gross_amount_paise: ${r.gross_amount_paise}`);
    });

    console.log('\n=== Bank Statements (first 3 HDFC) ===');
    const bankResult = await client.query(`
      SELECT utr, bank_name, amount_paise, gross_amount_paise
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'HDFC%'
      ORDER BY utr
      LIMIT 3
    `);
    bankResult.rows.forEach(r => {
      console.log(`UTR: ${r.utr}, Bank: ${r.bank_name}, amount_paise: ${r.amount_paise}, gross_amount_paise: ${r.gross_amount_paise}`);
    });

    console.log('\n=== Bank Statements (first 3 AXIS) ===');
    const axisResult = await client.query(`
      SELECT utr, bank_name, amount_paise, gross_amount_paise
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'AXIS%'
      ORDER BY utr
      LIMIT 3
    `);
    axisResult.rows.forEach(r => {
      console.log(`UTR: ${r.utr}, Bank: ${r.bank_name}, amount_paise: ${r.amount_paise}, gross_amount_paise: ${r.gross_amount_paise}`);
    });

    console.log('\n=== Bank Statements (first 3 ICICI) ===');
    const iciciResult = await client.query(`
      SELECT utr, bank_name, amount_paise, gross_amount_paise
      FROM sp_v2_bank_statements
      WHERE utr LIKE 'ICICI%'
      ORDER BY utr
      LIMIT 3
    `);
    iciciResult.rows.forEach(r => {
      console.log(`UTR: ${r.utr}, Bank: ${r.bank_name}, amount_paise: ${r.amount_paise}, gross_amount_paise: ${r.gross_amount_paise}`);
    });

    console.log('\n=== Reconciliation Exceptions (first 5) ===');
    const exResult = await client.query(`
      SELECT pg_txn_id, bank_utr, reason, pg_amount_paise, bank_amount_paise
      FROM sp_v2_reconciliation_results
      WHERE result = 'EXCEPTION'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    exResult.rows.forEach(r => {
      console.log(`TXN: ${r.pg_txn_id}, UTR: ${r.bank_utr}, Reason: ${r.reason}, PG Amount: ${r.pg_amount_paise}, Bank Amount: ${r.bank_amount_paise}`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
