#!/usr/bin/env node

/**
 * Query Oct 26, 2025 Transactions from Staging Database
 *
 * This script connects to the staging RDS database and retrieves
 * detailed information about all transactions created on Oct 26, 2025
 * to identify upload batches and insertion timestamps.
 */

const { Pool } = require('pg');

// Staging RDS Database Configuration
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
});

async function queryOct26Transactions() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('STAGING DATABASE - Oct 26, 2025 Transaction Analysis');
    console.log('='.repeat(80));
    console.log('');

    // Get all transactions for Oct 26, 2025
    const txnQuery = `
      SELECT
        id,
        transaction_id,
        source_type,
        amount_paise,
        status,
        transaction_date,
        created_at,
        updated_at,
        DATE_TRUNC('minute', created_at) as created_minute
      FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-26'
      ORDER BY created_at ASC;
    `;

    const txnResult = await client.query(txnQuery);
    const transactions = txnResult.rows;

    console.log(`📊 Total Transactions for Oct 26, 2025: ${transactions.length}`);
    console.log('');

    // Group by creation time (rounded to minute)
    const batchMap = new Map();
    transactions.forEach(txn => {
      const minuteKey = txn.created_minute.toISOString();
      if (!batchMap.has(minuteKey)) {
        batchMap.set(minuteKey, []);
      }
      batchMap.get(minuteKey).push(txn);
    });

    // Group by source_type
    const bySource = transactions.reduce((acc, txn) => {
      acc[txn.source_type] = (acc[txn.source_type] || 0) + 1;
      return acc;
    }, {});

    console.log('📈 Breakdown by Source Type:');
    console.log('-'.repeat(80));
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`${source}: ${count} transactions`);
    });
    console.log('');

    // Show batches by creation time
    console.log('⏰ Upload Batches (grouped by creation minute):');
    console.log('-'.repeat(80));

    let batchNum = 1;
    for (const [minuteKey, batch] of batchMap.entries()) {
      const firstTxn = batch[0];
      const createdAt = new Date(minuteKey);

      // Convert to IST
      const istTime = new Date(createdAt.getTime() + (5.5 * 60 * 60 * 1000));

      console.log(`\nBatch ${batchNum}: ${istTime.toISOString().replace('T', ' ').substring(0, 19)} IST`);
      console.log(`  Count: ${batch.length} transactions`);
      console.log(`  Source Type: ${firstTxn.source_type}`);
      console.log(`  Status: ${firstTxn.status}`);
      console.log(`  Transaction IDs: ${batch.slice(0, 5).map(t => t.transaction_id).join(', ')}${batch.length > 5 ? '...' : ''}`);

      batchNum++;
    }

    console.log('');
    console.log('');

    // Show first 10 and last 10 transactions chronologically
    console.log('📋 First 10 Transactions (by insertion time):');
    console.log('-'.repeat(80));
    transactions.slice(0, 10).forEach((txn, idx) => {
      const istTime = new Date(txn.created_at.getTime() + (5.5 * 60 * 60 * 1000));
      console.log(`${idx + 1}. ${txn.transaction_id} | ${txn.source_type} | ₹${(txn.amount_paise / 100).toFixed(2)}`);
      console.log(`   Created: ${istTime.toISOString().replace('T', ' ').substring(0, 19)} IST`);
      console.log(`   Status: ${txn.status}`);
    });

    console.log('');
    console.log('📋 Last 10 Transactions (by insertion time):');
    console.log('-'.repeat(80));
    transactions.slice(-10).forEach((txn, idx) => {
      const istTime = new Date(txn.created_at.getTime() + (5.5 * 60 * 60 * 1000));
      console.log(`${idx + 1}. ${txn.transaction_id} | ${txn.source_type} | ₹${(txn.amount_paise / 100).toFixed(2)}`);
      console.log(`   Created: ${istTime.toISOString().replace('T', ' ').substring(0, 19)} IST`);
      console.log(`   Status: ${txn.status}`);
    });

    console.log('');
    console.log('');

    // Check upload sessions table if it exists
    const tableCheckQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_upload_sessions'
      );
    `;

    const tableCheckResult = await client.query(tableCheckQuery);

    if (tableCheckResult.rows[0].exists) {
      console.log('📁 Upload Sessions for Oct 26, 2025:');
      console.log('-'.repeat(80));

      const uploadsQuery = `
        SELECT
          upload_id,
          file_name,
          file_type,
          file_size_bytes,
          status,
          rows_processed,
          rows_inserted,
          created_at
        FROM sp_v2_upload_sessions
        WHERE created_at::date = '2025-10-26'
        ORDER BY created_at ASC;
      `;

      const uploadsResult = await client.query(uploadsQuery);

      if (uploadsResult.rows.length > 0) {
        uploadsResult.rows.forEach((upload, idx) => {
          const istTime = new Date(upload.created_at.getTime() + (5.5 * 60 * 60 * 1000));
          console.log(`\n${idx + 1}. ${upload.file_name}`);
          console.log(`   Type: ${upload.file_type}`);
          console.log(`   Status: ${upload.status}`);
          console.log(`   Rows: ${upload.rows_processed} processed, ${upload.rows_inserted} inserted`);
          console.log(`   Size: ${(upload.file_size_bytes / 1024).toFixed(2)} KB`);
          console.log(`   Uploaded: ${istTime.toISOString().replace('T', ' ').substring(0, 19)} IST`);
        });
      } else {
        console.log('No upload sessions found for Oct 26, 2025');
      }
    } else {
      console.log('ℹ️  sp_v2_upload_sessions table does not exist');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Analysis Complete');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

queryOct26Transactions();
