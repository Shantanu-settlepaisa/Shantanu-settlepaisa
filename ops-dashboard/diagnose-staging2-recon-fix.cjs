/**
 * Staging 2 Recon Diagnostic Script
 *
 * Purpose: Verify HDFC recon fix after deploying updated v1-column-mapper
 *
 * Checks:
 * 1. HDFC bank mapping exists in database
 * 2. Recent uploaded transactions have UTR populated
 * 3. Recent uploaded bank statements have UTR populated
 * 4. Latest recon job results and exception reasons
 * 5. Database connectivity
 */

const { Pool } = require('pg');

// Staging 2 Database Configuration
const DB_CONFIG = {
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123'
};

async function runDiagnostics() {
  console.log('🔍 STAGING 2 RECON DIAGNOSTIC - HDFC FIX VERIFICATION\n');
  console.log('=' .repeat(80));

  const pool = new Pool(DB_CONFIG);

  try {
    // TEST 1: Database Connectivity
    console.log('\n📡 TEST 1: Database Connectivity');
    console.log('-'.repeat(80));
    const connTest = await pool.query('SELECT NOW() as current_time, current_database()');
    console.log('✅ Connected to:', connTest.rows[0].current_database);
    console.log('✅ Server time:', connTest.rows[0].current_time);

    // TEST 2: HDFC Bank Mapping
    console.log('\n🏦 TEST 2: HDFC Bank Mapping in sp_v2_bank_column_mappings');
    console.log('-'.repeat(80));
    const hdfcMapping = await pool.query(`
      SELECT
        config_name,
        bank_name,
        file_type,
        v1_column_mappings,
        is_active,
        created_at
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
      ORDER BY created_at DESC
    `);

    if (hdfcMapping.rows.length > 0) {
      hdfcMapping.rows.forEach(row => {
        console.log(`✅ Found: ${row.bank_name} (${row.config_name})`);
        console.log(`   Active: ${row.is_active}`);
        console.log(`   Mappings:`, JSON.stringify(row.v1_column_mappings, null, 2));
      });
    } else {
      console.log('❌ NO HDFC bank mapping found! This will cause recon to fail.');
    }

    // TEST 3: Recent PG Transactions (Manual Uploads)
    console.log('\n📊 TEST 3: Recent PG Transactions (Manual Upload, Oct 28)');
    console.log('-'.repeat(80));
    const pgTxns = await pool.query(`
      SELECT
        transaction_id,
        merchant_id,
        utr,
        amount_paise,
        gross_amount_paise,
        transaction_date,
        status,
        source_type,
        created_at
      FROM sp_v2_transactions
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`Found ${pgTxns.rowCount} PG transactions for 2025-10-28`);
    if (pgTxns.rows.length > 0) {
      pgTxns.rows.forEach((row, idx) => {
        const utrStatus = row.utr ? '✅' : '❌';
        console.log(`  ${idx + 1}. TxnID: ${row.transaction_id}`);
        console.log(`     ${utrStatus} UTR: ${row.utr || 'MISSING!'}`);
        console.log(`     Amount: ₹${row.amount_paise / 100} | Gross: ₹${row.gross_amount_paise / 100}`);
        console.log(`     Status: ${row.status} | Date: ${row.transaction_date}`);
      });
    } else {
      console.log('⚠️  No manual PG transactions found for Oct 28');
    }

    // TEST 4: Recent Bank Statements (Manual Uploads)
    console.log('\n🏦 TEST 4: Recent Bank Statements (Manual Upload, Oct 28)');
    console.log('-'.repeat(80));
    const bankStmts = await pool.query(`
      SELECT
        id,
        bank_ref,
        bank_name,
        utr,
        amount_paise,
        gross_amount_paise,
        transaction_date,
        source_type,
        created_at
      FROM sp_v2_bank_statements
      WHERE source_type = 'MANUAL_UPLOAD'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`Found ${bankStmts.rowCount} bank statements for 2025-10-28`);
    if (bankStmts.rows.length > 0) {
      bankStmts.rows.forEach((row, idx) => {
        const utrStatus = row.utr ? '✅' : '❌';
        console.log(`  ${idx + 1}. Bank: ${row.bank_name} | Ref: ${row.bank_ref}`);
        console.log(`     ${utrStatus} UTR: ${row.utr || 'MISSING!'}`);
        console.log(`     Amount: ₹${row.amount_paise / 100} | Gross: ₹${(row.gross_amount_paise || 0) / 100}`);
      });
    } else {
      console.log('⚠️  No manual bank statements found for Oct 28');
    }

    // TEST 5: Recent Recon Jobs
    console.log('\n🔄 TEST 5: Recent Reconciliation Jobs');
    console.log('-'.repeat(80));
    const reconJobs = await pool.query(`
      SELECT
        job_id,
        job_name,
        status,
        total_pg_records,
        total_bank_records,
        matched_records,
        unmatched_pg,
        unmatched_bank,
        exception_records,
        created_at
      FROM sp_v2_reconciliation_jobs
      ORDER BY created_at DESC
      LIMIT 3
    `);

    if (reconJobs.rows.length > 0) {
      reconJobs.rows.forEach((job, idx) => {
        console.log(`\n  Job ${idx + 1}: ${job.job_id}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  PG: ${job.total_pg_records} | Bank: ${job.total_bank_records}`);
        console.log(`  ✅ Matched: ${job.matched_records}`);
        console.log(`  ⚠️  Unmatched PG: ${job.unmatched_pg}`);
        console.log(`  ⚠️  Unmatched Bank: ${job.unmatched_bank}`);
        console.log(`  ❌ Exceptions: ${job.exception_records}`);
        console.log(`  Created: ${job.created_at}`);

        // Calculate match rate
        const total = job.matched_records + job.unmatched_pg + job.unmatched_bank + job.exception_records;
        const matchRate = total > 0 ? ((job.matched_records / total) * 100).toFixed(1) : 0;
        console.log(`  📊 Match Rate: ${matchRate}%`);
      });
    } else {
      console.log('⚠️  No reconciliation jobs found');
    }

    // TEST 6: Exception Reasons from Latest Job
    console.log('\n❌ TEST 6: Exception Reasons (Latest Job)');
    console.log('-'.repeat(80));
    const latestJob = reconJobs.rows[0];
    if (latestJob) {
      const exceptions = await pool.query(`
        SELECT
          exception_reason_code,
          exception_message,
          COUNT(*) as count
        FROM sp_v2_reconciliation_results
        WHERE job_id = $1
          AND match_status = 'EXCEPTION'
        GROUP BY exception_reason_code, exception_message
        ORDER BY count DESC
      `, [latestJob.job_id]);

      if (exceptions.rows.length > 0) {
        console.log(`Found ${exceptions.rowCount} exception types:`);
        exceptions.rows.forEach((exc, idx) => {
          console.log(`  ${idx + 1}. ${exc.exception_reason_code} (${exc.count} occurrences)`);
          console.log(`     Message: ${exc.exception_message}`);
        });

        // Check for UTR_MISSING exceptions
        const utrMissing = exceptions.rows.find(r => r.exception_reason_code === 'UTR_MISSING_OR_INVALID');
        if (utrMissing) {
          console.log(`\n⚠️  ALERT: ${utrMissing.count} records have UTR_MISSING_OR_INVALID`);
          console.log('   This suggests MERCHANT_TRACKID mapping is still not working!');
        }
      } else {
        console.log('✅ No exceptions in latest job!');
      }
    }

    // TEST 7: UTR Comparison (PG vs Bank)
    console.log('\n🔍 TEST 7: UTR Comparison (Do PG and Bank UTRs match?)');
    console.log('-'.repeat(80));
    const utrCompare = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sp_v2_transactions
         WHERE source_type = 'MANUAL_UPLOAD'
         AND DATE(transaction_date) = '2025-10-28'
         AND (utr IS NULL OR utr = '')) as pg_missing_utr,
        (SELECT COUNT(*) FROM sp_v2_bank_statements
         WHERE source_type = 'MANUAL_UPLOAD'
         AND DATE(transaction_date) = '2025-10-28'
         AND (utr IS NULL OR utr = '')) as bank_missing_utr,
        (SELECT COUNT(DISTINCT t.utr)
         FROM sp_v2_transactions t
         JOIN sp_v2_bank_statements b ON t.utr = b.utr
         WHERE t.source_type = 'MANUAL_UPLOAD'
         AND b.source_type = 'MANUAL_UPLOAD'
         AND DATE(t.transaction_date) = '2025-10-28'
         AND DATE(b.transaction_date) = '2025-10-28') as matching_utrs
    `);

    const stats = utrCompare.rows[0];
    console.log(`PG transactions missing UTR: ${stats.pg_missing_utr}`);
    console.log(`Bank statements missing UTR: ${stats.bank_missing_utr}`);
    console.log(`✅ Matching UTRs between PG and Bank: ${stats.matching_utrs}`);

    if (stats.pg_missing_utr > 0 || stats.bank_missing_utr > 0) {
      console.log('\n❌ PROBLEM: UTRs are missing! Recon will fail.');
    } else {
      console.log('\n✅ UTRs look good!');
    }

    // SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📋 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(80));

    const issues = [];
    if (hdfcMapping.rows.length === 0) issues.push('HDFC bank mapping missing');
    if (pgTxns.rows.some(r => !r.utr)) issues.push('PG transactions missing UTR');
    if (bankStmts.rows.some(r => !r.utr)) issues.push('Bank statements missing UTR');
    if (stats.matching_utrs === 0) issues.push('No matching UTRs between PG and Bank');

    if (issues.length === 0) {
      console.log('✅ ALL CHECKS PASSED! System should work correctly.');
    } else {
      console.log('❌ ISSUES FOUND:');
      issues.forEach((issue, idx) => {
        console.log(`   ${idx + 1}. ${issue}`);
      });
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run diagnostics
runDiagnostics().catch(console.error);
