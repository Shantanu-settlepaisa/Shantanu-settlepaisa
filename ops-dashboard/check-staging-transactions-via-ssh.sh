#!/bin/bash

# SSH into EC2 and run the database query
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44 << 'ENDSSH'

# Create a temporary Node.js script to query the database
cat > /tmp/check_transactions.js << 'ENDJS'
const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024!',
});

async function checkTransactions() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('STAGING DATABASE - sp_v2_transactions Analysis');
    console.log('='.repeat(80));
    console.log('');

    // Get total count
    const countResult = await client.query('SELECT COUNT(*) as total FROM sp_v2_transactions;');
    console.log(`Total Transactions: ${countResult.rows[0].total}`);
    console.log('');

    // Get last 10 transactions
    const lastTxns = await client.query(`
      SELECT
        id,
        transaction_id,
        source_type,
        amount_paise,
        status,
        created_at,
        updated_at
      FROM sp_v2_transactions
      ORDER BY created_at DESC
      LIMIT 10;
    `);

    console.log('Last 10 Transactions (by created_at):');
    console.log('-'.repeat(80));
    lastTxns.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.id} | Txn ID: ${row.transaction_id}`);
      console.log(`   Source: ${row.source_type} | Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Created: ${row.created_at}`);
      console.log(`   Updated: ${row.updated_at}`);
      console.log('');
    });

    // Get activity timeline
    const activity = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30d,
        MAX(created_at) as most_recent,
        MIN(created_at) as oldest
      FROM sp_v2_transactions;
    `);

    console.log('Transaction Activity Timeline:');
    console.log('-'.repeat(80));
    const act = activity.rows[0];
    console.log(`Last 24 hours:  ${act.last_24h} transactions`);
    console.log(`Last 7 days:    ${act.last_7d} transactions`);
    console.log(`Last 30 days:   ${act.last_30d} transactions`);
    console.log(`Most recent:    ${act.most_recent}`);
    console.log(`Oldest record:  ${act.oldest}`);
    console.log('');

    // Get count by status
    const byStatus = await client.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM sp_v2_transactions
      GROUP BY status
      ORDER BY count DESC;
    `);

    console.log('Transactions by Status:');
    console.log('-'.repeat(80));
    byStatus.rows.forEach(row => {
      console.log(`${row.status}: ${row.count} transactions`);
    });

    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTransactions();
ENDJS

# Run the script
node /tmp/check_transactions.js

# Clean up
rm /tmp/check_transactions.js

ENDSSH
