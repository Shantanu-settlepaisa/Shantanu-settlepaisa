#!/usr/bin/env node

/**
 * Check amount fields in database to diagnose amount mismatch exceptions
 * User reported: UI shows amounts match but backend shows different amounts
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2'
});

async function checkAmounts() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Checking Amount Fields in Database');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Check PG transaction amounts
    console.log('📊 PG TRANSACTIONS (sample):\n');

    const pgAmounts = await pool.query(`
      SELECT
        transaction_id,
        utr,
        amount_paise,
        gross_amount_paise,
        CASE
          WHEN gross_amount_paise IS NOT NULL THEN 'HAS GROSS'
          ELSE 'NO GROSS (will use net)'
        END as gross_status
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      ORDER BY transaction_id
      LIMIT 10
    `);

    console.log('TXN_ID      | UTR       | Net Amount | Gross Amount | Status');
    console.log('------------|-----------|------------|--------------|-------------------');
    pgAmounts.rows.forEach(row => {
      const net = row.amount_paise ? (row.amount_paise / 100).toFixed(2) : 'NULL';
      const gross = row.gross_amount_paise ? (row.gross_amount_paise / 100).toFixed(2) : 'NULL';
      console.log(`${row.transaction_id.padEnd(11)} | ${row.utr.padEnd(9)} | ₹${net.padStart(8)} | ₹${gross.padStart(10)} | ${row.gross_status}`);
    });

    // Count how many have gross amounts
    const pgGrossCount = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(gross_amount_paise) as with_gross,
        COUNT(*) - COUNT(gross_amount_paise) as without_gross
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
    `);

    console.log('\nGross Amount Summary:');
    console.log(`  Total: ${pgGrossCount.rows[0].total}`);
    console.log(`  With gross_amount_paise: ${pgGrossCount.rows[0].with_gross}`);
    console.log(`  Without gross_amount_paise: ${pgGrossCount.rows[0].without_gross}`);

    if (parseInt(pgGrossCount.rows[0].without_gross) > 0) {
      console.log('\n⚠️  WARNING: Some PG transactions missing gross_amount_paise!');
      console.log('   Reconciliation will fall back to amount_paise (net amount).');
    }

    // 2. Check Bank statement amounts
    console.log('\n\n📊 BANK STATEMENTS (sample):\n');

    const bankAmounts = await pool.query(`
      SELECT
        bank_name,
        utr,
        amount_paise,
        gross_amount_paise,
        CASE
          WHEN gross_amount_paise IS NOT NULL THEN 'HAS GROSS'
          ELSE 'NO GROSS (will use net)'
        END as gross_status
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      ORDER BY bank_name, utr
      LIMIT 15
    `);

    console.log('Bank          | UTR       | Net Amount | Gross Amount | Status');
    console.log('--------------|-----------|------------|--------------|-------------------');
    bankAmounts.rows.forEach(row => {
      const net = row.amount_paise ? (row.amount_paise / 100).toFixed(2) : 'NULL';
      const gross = row.gross_amount_paise ? (row.gross_amount_paise / 100).toFixed(2) : 'NULL';
      console.log(`${row.bank_name.padEnd(13)} | ${row.utr.padEnd(9)} | ₹${net.padStart(8)} | ₹${gross.padStart(10)} | ${row.gross_status}`);
    });

    // Count how many have gross amounts by bank
    const bankGrossCount = await pool.query(`
      SELECT
        bank_name,
        COUNT(*) as total,
        COUNT(gross_amount_paise) as with_gross,
        COUNT(*) - COUNT(gross_amount_paise) as without_gross
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-29'
        AND source_type = 'MANUAL_UPLOAD'
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    console.log('\nGross Amount Summary by Bank:');
    bankGrossCount.rows.forEach(row => {
      console.log(`\n  ${row.bank_name}:`);
      console.log(`    Total: ${row.total}`);
      console.log(`    With gross_amount_paise: ${row.with_gross}`);
      console.log(`    Without gross_amount_paise: ${row.without_gross}`);

      if (parseInt(row.without_gross) > 0) {
        console.log(`    ⚠️  ${row.without_gross} records missing gross amount!`);
      }
    });

    // 3. Check for matching records
    console.log('\n\n🔍 MATCHING ANALYSIS:\n');

    const matchingAmounts = await pool.query(`
      SELECT
        pg.transaction_id,
        pg.utr,
        pg.amount_paise as pg_net,
        pg.gross_amount_paise as pg_gross,
        bank.amount_paise as bank_net,
        bank.gross_amount_paise as bank_gross,
        COALESCE(pg.gross_amount_paise, pg.amount_paise) as pg_used,
        COALESCE(bank.gross_amount_paise, bank.amount_paise) as bank_used,
        ABS(COALESCE(pg.gross_amount_paise, pg.amount_paise) - COALESCE(bank.gross_amount_paise, bank.amount_paise)) as diff
      FROM sp_v2_transactions pg
      INNER JOIN sp_v2_bank_statements bank ON pg.utr = bank.utr
      WHERE DATE(pg.transaction_date) = '2025-10-29'
        AND pg.source_type = 'MANUAL_UPLOAD'
        AND DATE(bank.transaction_date) = '2025-10-29'
        AND bank.source_type = 'MANUAL_UPLOAD'
      ORDER BY pg.transaction_id
      LIMIT 10
    `);

    console.log('TXN_ID | UTR      | PG(net/gross/used) | Bank(net/gross/used) | Diff');
    console.log('-------|----------|--------------------|-----------------------|------');
    matchingAmounts.rows.forEach(row => {
      const pgNet = row.pg_net ? (row.pg_net / 100).toFixed(2) : 'NULL';
      const pgGross = row.pg_gross ? (row.pg_gross / 100).toFixed(2) : 'NULL';
      const pgUsed = row.pg_used ? (row.pg_used / 100).toFixed(2) : 'NULL';
      const bankNet = row.bank_net ? (row.bank_net / 100).toFixed(2) : 'NULL';
      const bankGross = row.bank_gross ? (row.bank_gross / 100).toFixed(2) : 'NULL';
      const bankUsed = row.bank_used ? (row.bank_used / 100).toFixed(2) : 'NULL';
      const diff = row.diff ? (row.diff / 100).toFixed(2) : '0.00';

      console.log(`${row.transaction_id} | ${row.utr} | ${pgNet}/${pgGross}/${pgUsed} | ${bankNet}/${bankGross}/${bankUsed} | ${diff}`);
    });

    // Check how many would mismatch
    const mismatchCount = await pool.query(`
      SELECT
        COUNT(*) as total_matches,
        SUM(CASE WHEN ABS(COALESCE(pg.gross_amount_paise, pg.amount_paise) - COALESCE(bank.gross_amount_paise, bank.amount_paise)) > 0 THEN 1 ELSE 0 END) as amount_mismatches
      FROM sp_v2_transactions pg
      INNER JOIN sp_v2_bank_statements bank ON pg.utr = bank.utr
      WHERE DATE(pg.transaction_date) = '2025-10-29'
        AND pg.source_type = 'MANUAL_UPLOAD'
        AND DATE(bank.transaction_date) = '2025-10-29'
        AND bank.source_type = 'MANUAL_UPLOAD'
    `);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 ANALYSIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalMatches = parseInt(mismatchCount.rows[0].total_matches || 0);
    const amountMismatches = parseInt(mismatchCount.rows[0].amount_mismatches || 0);

    console.log(`UTR Matches: ${totalMatches}`);
    console.log(`Amount Mismatches: ${amountMismatches}`);
    console.log(`Perfect Matches: ${totalMatches - amountMismatches}`);

    if (amountMismatches === 0) {
      console.log('\n✅ SUCCESS: All amounts match perfectly!');
      console.log('   Reconciliation should show 50/50 matches with 0 exceptions.');
    } else {
      console.log(`\n⚠️  ISSUE: ${amountMismatches} records have amount mismatches!`);
      console.log('\nPossible causes:');
      console.log('  1. CSV files have different amounts for same UTR');
      console.log('  2. V1-V2 mapper not setting gross_amount_paise correctly');
      console.log('  3. Reconciliation logic comparing wrong fields');
      console.log('\nReview the matching analysis above to identify patterns.');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkAmounts();
