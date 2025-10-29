#!/usr/bin/env node

/**
 * Check Deployed Server Database Activity
 * Investigates the 20→30 transaction change on staging
 * Date: October 26, 2025
 */

const { Pool } = require('pg');

// The deployed server at 13.201.179.44:5108 uses the RDS instance
// Database name is 'settlepaisa' (not 'settlepaisa_v2')
const pool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99', // SabPaisa RDS host from env.cjs
  database: 'settlepaisa', // Production database
  password: 'sabpaisa123',
  port: 5432,
});

async function investigateTransactionChange() {
  console.log('🔍 Investigating Transaction Count Change (20→30)');
  console.log('=' .repeat(70));
  console.log('Target: Deployed server at 13.201.179.44:5108');
  console.log('Date: October 26, 2025');
  console.log('');

  try {
    // 1. Get total transactions for Oct 26
    console.log('📊 OCTOBER 26, 2025 TRANSACTION SUMMARY');
    console.log('-'.repeat(70));

    const oct26Total = await pool.query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE source_type = 'pg') as pg_count,
        COUNT(*) FILTER (WHERE source_type = 'bank') as bank_count,
        SUM(amount) as total_amount,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-26'
    `);

    const oct26 = oct26Total.rows[0];
    console.log(`Total Transactions on Oct 26: ${oct26.total_transactions}`);
    console.log(`  - PG Transactions: ${oct26.pg_count}`);
    console.log(`  - Bank Statements: ${oct26.bank_count}`);
    console.log(`Total Amount: ₹${oct26.total_amount ? (oct26.total_amount / 100).toFixed(2) : '0'}`);
    console.log(`Time Range: ${oct26.earliest} to ${oct26.latest}`);
    console.log('');

    // 2. Upload sessions for Oct 26
    console.log('📤 UPLOAD SESSIONS ON OCTOBER 26');
    console.log('-'.repeat(70));

    const uploadSessions = await pool.query(`
      SELECT
        id,
        file_type,
        file_name,
        record_count,
        status,
        uploaded_at,
        uploaded_by
      FROM sp_v2_upload_sessions
      WHERE DATE(uploaded_at) = '2025-10-26'
      ORDER BY uploaded_at ASC
    `);

    if (uploadSessions.rows.length === 0) {
      console.log('❌ No upload sessions found for Oct 26');
    } else {
      console.log(`Found ${uploadSessions.rows.length} upload session(s):\n`);
      uploadSessions.rows.forEach((session, idx) => {
        console.log(`Session ${idx + 1}:`);
        console.log(`  ID: ${session.id}`);
        console.log(`  File: ${session.file_name} (${session.file_type})`);
        console.log(`  Records: ${session.record_count}`);
        console.log(`  Status: ${session.status}`);
        console.log(`  Time: ${session.uploaded_at}`);
        console.log(`  By: ${session.uploaded_by || 'N/A'}`);
        console.log('');
      });
    }

    // 3. Timeline of transactions created today
    console.log('⏰ TRANSACTION CREATION TIMELINE (Oct 26)');
    console.log('-'.repeat(70));

    const timeline = await pool.query(`
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE source_type = 'pg') as pg_count,
        COUNT(*) FILTER (WHERE source_type = 'bank') as bank_count
      FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-26'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour ASC
    `);

    console.log('Hour | Total | PG | Bank');
    console.log('-'.repeat(70));
    timeline.rows.forEach(row => {
      const hour = new Date(row.hour).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      console.log(`${hour} | ${row.count} | ${row.pg_count} | ${row.bank_count}`);
    });
    console.log('');

    // 4. Most recent 30 transactions (what user is seeing)
    console.log('💰 CURRENT 30 TRANSACTIONS (What Dashboard Shows)');
    console.log('-'.repeat(70));

    const recent30 = await pool.query(`
      SELECT
        id,
        transaction_id,
        source_type,
        amount,
        status,
        created_at,
        upload_session_id
      FROM sp_v2_transactions
      WHERE DATE(created_at) = '2025-10-26'
      ORDER BY created_at DESC
      LIMIT 30
    `);

    console.log('# | Source | Txn ID | Amount | Created At | Session ID');
    console.log('-'.repeat(70));
    recent30.rows.forEach((row, idx) => {
      const amount = row.amount ? `₹${(row.amount / 100).toFixed(2)}` : 'N/A';
      const time = new Date(row.created_at).toLocaleTimeString('en-US');
      const sessionId = row.upload_session_id ? row.upload_session_id.toString().slice(0, 8) : 'N/A';
      console.log(`${idx + 1} | ${row.source_type} | ${row.transaction_id?.slice(0, 12) || 'N/A'} | ${amount} | ${time} | ${sessionId}`);
    });
    console.log('');

    // 5. Check if there were any deletions/updates today
    console.log('🔄 AUDIT LOG CHECK (Oct 26)');
    console.log('-'.repeat(70));

    const auditLog = await pool.query(`
      SELECT
        action,
        table_name,
        COUNT(*) as count,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence
      FROM sp_v2_ops_audit_log
      WHERE DATE(created_at) = '2025-10-26'
      GROUP BY action, table_name
      ORDER BY last_occurrence DESC
    `);

    if (auditLog.rows.length === 0) {
      console.log('No audit log entries for today');
    } else {
      console.log('Action | Table | Count | First | Last');
      console.log('-'.repeat(70));
      auditLog.rows.forEach(row => {
        const first = new Date(row.first_occurrence).toLocaleTimeString('en-US');
        const last = new Date(row.last_occurrence).toLocaleTimeString('en-US');
        console.log(`${row.action} | ${row.table_name} | ${row.count} | ${first} | ${last}`);
      });
    }
    console.log('');

    // 6. Summary and conclusion
    console.log('📋 INVESTIGATION SUMMARY');
    console.log('-'.repeat(70));
    console.log(`✅ Current transaction count for Oct 26: ${oct26.total_transactions}`);
    console.log(`✅ Upload sessions today: ${uploadSessions.rows.length}`);
    console.log('');

    if (uploadSessions.rows.length > 0) {
      const totalUploaded = uploadSessions.rows.reduce((sum, s) => sum + (s.record_count || 0), 0);
      console.log(`💡 EXPLANATION:`);
      console.log(`   - ${uploadSessions.rows.length} file upload(s) occurred today`);
      console.log(`   - Total records uploaded: ${totalUploaded}`);
      console.log(`   - This explains the increase from 20→30 transactions`);
    } else {
      console.log(`⚠️  No uploads found - transactions may have been imported differently`);
    }

  } catch (error) {
    console.error('❌ Error investigating database:', error.message);
    console.error('   Code:', error.code);

    if (error.code === 'ECONNREFUSED') {
      console.error('   → Cannot connect to database server');
    } else if (error.code === '28P01') {
      console.error('   → Authentication failed - wrong credentials');
    } else if (error.code === '3D000') {
      console.error('   → Database does not exist');
    }
  } finally {
    await pool.end();
  }
}

// Run investigation
investigateTransactionChange().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
