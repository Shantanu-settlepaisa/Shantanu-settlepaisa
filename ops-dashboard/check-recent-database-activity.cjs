#!/usr/bin/env node

/**
 * Check Recent Database Activity
 * Shows all recent transactions, uploads, and database statistics
 * Date: October 26, 2025
 */

const { Pool } = require('pg');
const config = require('./services/config/env.cjs');

// Create pool with proper config
const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password || '', // Handle empty password
  port: config.db.port,
});

async function checkRecentActivity() {
  console.log('🔍 SettlePaisa Database Activity Check');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // 1. Overall Statistics
    console.log('📊 OVERALL DATABASE STATISTICS');
    console.log('-'.repeat(60));

    const totalStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE source_type = 'pg') as pg_total,
        COUNT(*) FILTER (WHERE source_type = 'bank') as bank_total,
        COUNT(*) as total,
        MIN(created_at) as earliest_entry,
        MAX(created_at) as latest_entry
      FROM sp_v2_transactions
    `);

    const stats = totalStats.rows[0];
    console.log(`Total Transactions: ${stats.total}`);
    console.log(`  - PG Transactions: ${stats.pg_total}`);
    console.log(`  - Bank Statements: ${stats.bank_total}`);
    console.log(`Earliest Entry: ${stats.earliest_entry}`);
    console.log(`Latest Entry: ${stats.latest_entry}`);
    console.log('');

    // 2. Today's Statistics
    console.log('📅 TODAY\'S ACTIVITY (Oct 26, 2025)');
    console.log('-'.repeat(60));

    const todayStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE source_type = 'pg') as pg_count,
        COUNT(*) FILTER (WHERE source_type = 'bank') as bank_count,
        COUNT(*) as total,
        SUM(amount) as total_amount,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled
      FROM sp_v2_transactions
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const today = todayStats.rows[0];
    console.log(`Today's Transactions: ${today.total || 0}`);
    console.log(`  - PG: ${today.pg_count || 0}`);
    console.log(`  - Bank: ${today.bank_count || 0}`);
    console.log(`Total Amount: ₹${today.total_amount ? (today.total_amount / 100000).toFixed(2) + 'L' : '0'}`);
    console.log(`Status Breakdown:`);
    console.log(`  - Pending: ${today.pending || 0}`);
    console.log(`  - Reconciled: ${today.reconciled || 0}`);
    console.log('');

    // 3. Recent Upload Sessions
    console.log('📤 RECENT UPLOAD SESSIONS (Last 10)');
    console.log('-'.repeat(60));

    const uploadSessions = await pool.query(`
      SELECT id, file_type, file_name, record_count, status, uploaded_at, uploaded_by
      FROM sp_v2_upload_sessions
      ORDER BY uploaded_at DESC
      LIMIT 10
    `);

    if (uploadSessions.rows.length === 0) {
      console.log('No upload sessions found');
    } else {
      console.log('ID | Type | Records | Status | Uploaded At | By');
      console.log('-'.repeat(60));
      uploadSessions.rows.forEach(row => {
        const uploadDate = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : 'N/A';
        console.log(`${row.id.toString().slice(0, 8)} | ${row.file_type || 'N/A'} | ${row.record_count || 0} | ${row.status} | ${uploadDate} | ${row.uploaded_by || 'N/A'}`);
      });
    }
    console.log('');

    // 4. Most Recent Transactions
    console.log('💰 MOST RECENT TRANSACTIONS (Last 15)');
    console.log('-'.repeat(60));

    const recentTxns = await pool.query(`
      SELECT id, source_type, transaction_id, amount, status, created_at, upload_session_id
      FROM sp_v2_transactions
      ORDER BY created_at DESC
      LIMIT 15
    `);

    if (recentTxns.rows.length === 0) {
      console.log('No transactions found');
    } else {
      console.log('ID | Source | Txn ID | Amount | Status | Created At | Session');
      console.log('-'.repeat(60));
      recentTxns.rows.forEach(row => {
        const amount = row.amount ? `₹${(row.amount / 100).toFixed(2)}` : 'N/A';
        const createdAt = row.created_at ? new Date(row.created_at).toISOString().slice(0, 16).replace('T', ' ') : 'N/A';
        const sessionId = row.upload_session_id ? row.upload_session_id.toString().slice(0, 8) : 'N/A';
        console.log(`${row.id} | ${row.source_type} | ${row.transaction_id?.slice(0, 12) || 'N/A'} | ${amount} | ${row.status} | ${createdAt} | ${sessionId}`);
      });
    }
    console.log('');

    // 5. Status Distribution
    console.log('📈 STATUS DISTRIBUTION (All Time)');
    console.log('-'.repeat(60));

    const statusDist = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(amount) as total_amount
      FROM sp_v2_transactions
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('Status | Count | Total Amount');
    console.log('-'.repeat(60));
    statusDist.rows.forEach(row => {
      const amount = row.total_amount ? `₹${(row.total_amount / 100000).toFixed(2)}L` : 'N/A';
      console.log(`${row.status} | ${row.count} | ${amount}`);
    });
    console.log('');

    // 6. Transactions by Date (Last 7 days)
    console.log('📆 TRANSACTIONS BY DATE (Last 7 Days)');
    console.log('-'.repeat(60));

    const byDate = await pool.query(`
      SELECT
        DATE(created_at) as txn_date,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM sp_v2_transactions
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY txn_date DESC
    `);

    console.log('Date | Count | Total Amount');
    console.log('-'.repeat(60));
    byDate.rows.forEach(row => {
      const amount = row.total_amount ? `₹${(row.total_amount / 100000).toFixed(2)}L` : '₹0';
      console.log(`${row.txn_date} | ${row.count} | ${amount}`);
    });
    console.log('');

    // 7. Check for Today's Specific Data (matching screenshot)
    console.log('🎯 TODAY\'S DETAILED BREAKDOWN (Matching Overview Screen)');
    console.log('-'.repeat(60));

    const todayDetail = await pool.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled
      FROM sp_v2_transactions
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY source_type
    `);

    if (todayDetail.rows.length === 0) {
      console.log('No transactions found for today');
    } else {
      console.log('Source | Count | Amount | Pending | Reconciled');
      console.log('-'.repeat(60));
      todayDetail.rows.forEach(row => {
        const amount = row.total_amount ? `₹${(row.total_amount / 100000).toFixed(2)}L` : '₹0';
        console.log(`${row.source_type} | ${row.count} | ${amount} | ${row.pending || 0} | ${row.reconciled || 0}`);
      });
    }
    console.log('');

    console.log('✅ Database check complete!');
    console.log('');

  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    if (error.code === '42P01') {
      console.error('   Table does not exist. Database may not be initialized.');
    } else if (error.code === '28P01') {
      console.error('   Authentication failed. Check database credentials.');
    }
  } finally {
    await pool.end();
  }
}

// Run the check
checkRecentActivity().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
