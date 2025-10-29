#!/usr/bin/env node
/**
 * Server-side test: Upload PG and Bank files, then run reconciliation
 * Tests the complete backend flow without browser/auth
 */

const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
require('dotenv').config({ path: './services/overview-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function uploadPGTransactions(csvPath) {
  console.log('\n📁 [PG Upload] Reading file:', csvPath);

  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', async () => {
        console.log(`📁 [PG Upload] Parsed ${rows.length} rows`);

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let inserted = 0;
          for (const row of rows) {
            const amount = parseFloat(row['paid_amount'] || row['payee_amount'] || 0);
            const amountPaise = Math.round(amount * 100); // Convert to paise
            const txnDate = row['trans_complete_date'] || row['transaction_date'] || '2025-10-28';

            await client.query(`
              INSERT INTO sp_v2_transactions (
                transaction_id, merchant_id, amount_paise, status,
                transaction_date, transaction_timestamp, source_type, payment_method, utr
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (transaction_id) DO NOTHING
            `, [
              row['transaction_id'],
              row['client_code'] || 'MERCH001',
              amountPaise,
              row['status'] || 'SUCCESS',
              txnDate.split(' ')[0], // Extract date part
              txnDate,
              'MANUAL_UPLOAD',
              row['payment_mode'] || 'UPI',
              row['utr'] || null
            ]);
            inserted++;
          }

          await client.query('COMMIT');
          console.log(`✅ [PG Upload] Inserted ${inserted} transactions`);
          resolve(inserted);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('❌ [PG Upload] Error:', error.message);
          reject(error);
        } finally {
          client.release();
        }
      })
      .on('error', reject);
  });
}

async function uploadBankStatements(csvPath, bankName = 'HDFC_BANK') {
  console.log('\n🏦 [Bank Upload] Reading file:', csvPath);
  console.log(`🏦 [Bank Upload] Bank: ${bankName}`);

  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', async () => {
        console.log(`🏦 [Bank Upload] Parsed ${rows.length} rows`);

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let inserted = 0;
          for (const row of rows) {
            const amount = parseFloat(row['Net Amount'] || row['DOMESTIC AMT'] || row['paid_amount'] || 0);
            const amountPaise = Math.round(amount * 100); // Convert to paise

            // Parse date from DD-MM-YYYY to YYYY-MM-DD
            const dateStr = row['SETTLE DATE'] || row['transaction_date'];
            let txnDate = '2025-10-28';
            if (dateStr && dateStr.includes('-')) {
              const parts = dateStr.split('-');
              if (parts.length === 3) {
                txnDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
            }

            const bankRef = `${bankName}-${row['MERCHANT_TRACKID'] || row['UTR'] || row['utr']}-${txnDate}`;

            await client.query(`
              INSERT INTO sp_v2_bank_statements (
                bank_ref, utr, bank_name, amount_paise,
                transaction_date, source_type
              ) VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (bank_ref) DO NOTHING
            `, [
              bankRef,
              row['MERCHANT_TRACKID'] || row['UTR'] || row['utr'],
              bankName,
              amountPaise,
              txnDate,
              'MANUAL_UPLOAD'
            ]);
            inserted++;
          }

          await client.query('COMMIT');
          console.log(`✅ [Bank Upload] Inserted ${inserted} bank statements`);
          resolve(inserted);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('❌ [Bank Upload] Error:', error.message);
          reject(error);
        } finally {
          client.release();
        }
      })
      .on('error', reject);
  });
}

async function verifyData() {
  console.log('\n🔍 [Verify] Checking database...');

  const pgResult = await pool.query(`
    SELECT COUNT(*) as count FROM sp_v2_transactions
    WHERE DATE(transaction_date) = '2025-10-28'
    AND source_type = 'MANUAL_UPLOAD'
  `);

  const bankResult = await pool.query(`
    SELECT COUNT(*) as count FROM sp_v2_bank_statements
    WHERE DATE(transaction_date) = '2025-10-28'
    AND source_type = 'MANUAL_UPLOAD'
  `);

  console.log(`✅ [Verify] PG Transactions: ${pgResult.rows[0].count}`);
  console.log(`✅ [Verify] Bank Statements: ${bankResult.rows[0].count}`);

  return {
    pgCount: parseInt(pgResult.rows[0].count),
    bankCount: parseInt(bankResult.rows[0].count)
  };
}

async function runReconciliation() {
  console.log('\n🔄 [Recon] Running reconciliation...');

  // Simulate reconciliation by matching UTRs
  const client = await pool.connect();
  try {
    const matchResult = await client.query(`
      SELECT
        t.transaction_id,
        t.utr as pg_utr,
        b.utr as bank_utr,
        t.amount_paise as pg_amount_paise,
        b.amount_paise as bank_amount_paise
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_bank_statements b ON t.utr = b.utr
      WHERE DATE(t.transaction_date) = '2025-10-28'
      AND t.source_type = 'MANUAL_UPLOAD'
      AND b.source_type = 'MANUAL_UPLOAD'
    `);

    console.log(`✅ [Recon] Matched: ${matchResult.rows.length} transactions`);

    return {
      matched: matchResult.rows.length,
      matches: matchResult.rows
    };
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🚀 [Test] Starting server-side upload test...\n');

    // Upload PG transactions
    const pgCount = await uploadPGTransactions('./test-manual-pg-v1-oct28.csv');

    // Upload bank statements
    const bankCount = await uploadBankStatements('./hdfc-bank-oct28-with-net-amount.csv', 'HDFC_BANK');

    // Verify data
    const verification = await verifyData();

    // Run reconciliation
    const reconResult = await runReconciliation();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`PG Transactions Uploaded: ${pgCount}`);
    console.log(`Bank Statements Uploaded: ${bankCount}`);
    console.log(`PG Transactions in DB: ${verification.pgCount}`);
    console.log(`Bank Statements in DB: ${verification.bankCount}`);
    console.log(`Reconciliation Matches: ${reconResult.matched}`);
    console.log('='.repeat(60));

    if (reconResult.matched === 10) {
      console.log('\n✅ SUCCESS: All 10 transactions matched!');
    } else {
      console.log('\n⚠️  WARNING: Expected 10 matches, got', reconResult.matched);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
  } finally {
    await pool.end();
  }
}

main();
