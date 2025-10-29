#!/usr/bin/env node

const { Pool } = require('pg');

// Staging Database Configuration
const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024!',
  port: 5432,
});

async function checkLastTransactions() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('STAGING DATABASE - sp_v2_transactions Analysis');
    console.log('='.repeat(80));
    console.log('');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table sp_v2_transactions does not exist!');
      return;
    }

    // Get total count
    const countResult = await client.query(`
      SELECT COUNT(*) as total FROM sp_v2_transactions;
    `);
    console.log(`📊 Total Transactions: ${countResult.rows[0].total}`);
    console.log('');

    // Get last 10 transactions with timestamps
    const lastTransactions = await client.query(`
      SELECT
        id,
        transaction_id,
        source_type,
        amount_paise,
        status,
        created_at,
        updated_at,
        NOW() - created_at as age
      FROM sp_v2_transactions
      ORDER BY created_at DESC
      LIMIT 10;
    `);

    console.log('📅 Last 10 Transactions (by created_at):');
    console.log('-'.repeat(80));
    lastTransactions.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.id} | Txn ID: ${row.transaction_id}`);
      console.log(`   Source: ${row.source_type} | Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Created: ${row.created_at}`);
      console.log(`   Age: ${row.age}`);
      console.log('');
    });

    // Get count by source_type
    const bySource = await client.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM sp_v2_transactions
      GROUP BY source_type
      ORDER BY count DESC;
    `);

    console.log('📊 Transactions by Source Type:');
    console.log('-'.repeat(80));
    bySource.rows.forEach(row => {
      console.log(`${row.source_type}: ${row.count} transactions`);
      console.log(`  First: ${row.first_created}`);
      console.log(`  Last:  ${row.last_created}`);
      console.log('');
    });

    // Get count by status
    const byStatus = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount_paise) as total_amount_paise
      FROM sp_v2_transactions
      GROUP BY status
      ORDER BY count DESC;
    `);

    console.log('📊 Transactions by Status:');
    console.log('-'.repeat(80));
    byStatus.rows.forEach(row => {
      console.log(`${row.status}: ${row.count} transactions | ₹${(row.total_amount_paise / 100).toFixed(2)}`);
    });
    console.log('');

    // Get recent activity (last 24 hours, 7 days, 30 days)
    const activityPeriods = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30d,
        MAX(created_at) as most_recent,
        MIN(created_at) as oldest
      FROM sp_v2_transactions;
    `);

    console.log('📅 Transaction Activity Timeline:');
    console.log('-'.repeat(80));
    const activity = activityPeriods.rows[0];
    console.log(`Last 24 hours:  ${activity.last_24h} transactions`);
    console.log(`Last 7 days:    ${activity.last_7d} transactions`);
    console.log(`Last 30 days:   ${activity.last_30d} transactions`);
    console.log(`Most recent:    ${activity.most_recent}`);
    console.log(`Oldest record:  ${activity.oldest}`);
    console.log('');

    // Check sp_v2_transactions_v1 table as well
    const tableCheckV1 = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions_v1'
      );
    `);

    if (tableCheckV1.rows[0].exists) {
      const countV1 = await client.query(`
        SELECT COUNT(*) as total FROM sp_v2_transactions_v1;
      `);
      console.log('='.repeat(80));
      console.log('STAGING DATABASE - sp_v2_transactions_v1 Analysis');
      console.log('='.repeat(80));
      console.log(`📊 Total Transactions: ${countV1.rows[0].total}`);

      const lastV1 = await client.query(`
        SELECT
          id,
          pgw_ref,
          merchant_id,
          amount,
          status,
          created_at,
          NOW() - created_at as age
        FROM sp_v2_transactions_v1
        ORDER BY created_at DESC
        LIMIT 5;
      `);

      console.log('');
      console.log('📅 Last 5 Transactions (by created_at):');
      console.log('-'.repeat(80));
      lastV1.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ID: ${row.id} | PGW Ref: ${row.pgw_ref}`);
        console.log(`   Merchant: ${row.merchant_id}`);
        console.log(`   Amount: ₹${(row.amount / 100).toFixed(2)} | Status: ${row.status}`);
        console.log(`   Created: ${row.created_at} | Age: ${row.age}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('✅ Analysis Complete');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

checkLastTransactions();
