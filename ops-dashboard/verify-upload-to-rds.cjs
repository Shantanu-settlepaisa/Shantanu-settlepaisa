#!/usr/bin/env node

/**
 * Verify that uploaded data is in RDS database with correct V1-V2 mapping
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function verifyUpload() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Verifying Upload to RDS Database');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Check PG transactions
    console.log('📊 PG TRANSACTIONS:\n');

    const pgCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
    `);
    console.log(`Total count: ${pgCount.rows[0].count} records`);

    const pgUtrs = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
        AND utr IS NOT NULL
        AND utr != ''
    `);
    console.log(`With UTRs: ${pgUtrs.rows[0].count} records`);

    const pgSamples = await pool.query(`
      SELECT transaction_id, utr, amount_paise, gross_amount_paise
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      ORDER BY transaction_id
      LIMIT 5
    `);

    console.log('\nSample records:');
    pgSamples.rows.forEach(row => {
      console.log(`  ${row.transaction_id}: UTR=${row.utr}, amount=${row.amount_paise}, gross=${row.gross_amount_paise || 'NULL'}`);
    });

    // Check for wrong field mapping
    const pgBankRef = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
        AND bank_ref LIKE 'UTR%'
        AND (utr IS NULL OR utr = '')
    `);

    if (parseInt(pgBankRef.rows[0].count) > 0) {
      console.log(`\n⚠️  WARNING: ${pgBankRef.rows[0].count} records have UTR in bank_ref instead of utr field!`);
    }

    // 2. Check Bank statements
    console.log('\n\n📊 BANK STATEMENTS:\n');

    const bankCount = await pool.query(`
      SELECT
        bank_name,
        COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    console.log('Total by bank:');
    bankCount.rows.forEach(row => {
      console.log(`  ${row.bank_name}: ${row.count} records`);
    });

    const bankUtrs = await pool.query(`
      SELECT
        bank_name,
        COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
        AND utr IS NOT NULL
        AND utr != ''
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    console.log('\nWith UTRs:');
    bankUtrs.rows.forEach(row => {
      console.log(`  ${row.bank_name}: ${row.count} records`);
    });

    const bankSamples = await pool.query(`
      SELECT bank_name, utr, amount_paise, gross_amount_paise
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      ORDER BY bank_name, utr
      LIMIT 15
    `);

    console.log('\nSample records:');
    let lastBank = '';
    bankSamples.rows.forEach(row => {
      if (row.bank_name !== lastBank) {
        console.log(`\n  ${row.bank_name}:`);
        lastBank = row.bank_name;
      }
      console.log(`    UTR=${row.utr}, amount=${row.amount_paise}, gross=${row.gross_amount_paise || 'NULL'}`);
    });

    // Check for wrong field mapping
    const bankBankRef = await pool.query(`
      SELECT bank_name, COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
        AND bank_ref LIKE 'UTR%'
        AND (utr IS NULL OR utr = '')
      GROUP BY bank_name
    `);

    if (bankBankRef.rows.length > 0) {
      console.log('\n\n⚠️  WARNING: UTRs in wrong field!');
      bankBankRef.rows.forEach(row => {
        console.log(`  ${row.bank_name}: ${row.count} records have UTR in bank_ref instead of utr`);
      });
    }

    // 3. Summary
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalPg = parseInt(pgCount.rows[0].count);
    const totalBank = bankCount.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const pgWithUtrs = parseInt(pgUtrs.rows[0].count);
    const bankWithUtrs = bankUtrs.rows.reduce((sum, row) => sum + parseInt(row.count), 0);

    console.log(`PG Transactions: ${totalPg} total, ${pgWithUtrs} with UTRs`);
    console.log(`Bank Statements: ${totalBank} total, ${bankWithUtrs} with UTRs`);

    if (totalPg === 50 && totalBank === 50 && pgWithUtrs === 50 && bankWithUtrs === 50) {
      console.log('\n✅ SUCCESS: All data uploaded correctly!');
      console.log('   - 50 PG transactions ✅');
      console.log('   - 50 Bank statements ✅');
      console.log('   - All UTRs in correct field ✅');
      console.log('\n🚀 Ready for reconciliation test!');
    } else {
      console.log('\n❌ ISSUE DETECTED:');
      if (totalPg !== 50) console.log(`   - Expected 50 PG transactions, got ${totalPg}`);
      if (totalBank !== 50) console.log(`   - Expected 50 Bank statements, got ${totalBank}`);
      if (pgWithUtrs !== totalPg) console.log(`   - ${totalPg - pgWithUtrs} PG transactions missing UTRs`);
      if (bankWithUtrs !== totalBank) console.log(`   - ${totalBank - bankWithUtrs} Bank statements missing UTRs`);
      console.log('\n⚠️  Review the samples above to diagnose the issue.');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyUpload();
