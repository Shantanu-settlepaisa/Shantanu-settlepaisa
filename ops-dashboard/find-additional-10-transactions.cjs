#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
});

async function findAdditional10() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('Finding the 10 Additional Transactions');
    console.log('='.repeat(80));
    console.log('');

    // Find transactions inserted on Oct 26 but with different transaction_date
    const query = `
      SELECT
        id,
        transaction_id,
        source_type,
        amount_paise,
        status,
        transaction_date,
        created_at,
        updated_at
      FROM sp_v2_transactions
      WHERE created_at::date = '2025-10-26'
        AND transaction_date != '2025-10-26'
      ORDER BY created_at ASC;
    `;

    const result = await client.query(query);

    console.log(`Found ${result.rows.length} transactions inserted on Oct 26 with different business dates`);
    console.log('');

    if (result.rows.length > 0) {
      // Group by transaction_date
      const byDate = {};
      result.rows.forEach(txn => {
        const dateKey = txn.transaction_date.toISOString().split('T')[0];
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(txn);
      });

      console.log('Grouped by Business Date (transaction_date):');
      console.log('-'.repeat(80));
      Object.entries(byDate).forEach(([date, txns]) => {
        console.log(`\n${date}: ${txns.length} transactions`);
        txns.forEach((txn, idx) => {
          const istCreated = new Date(txn.created_at.getTime() + (5.5 * 60 * 60 * 1000));
          console.log(`  ${idx + 1}. ${txn.transaction_id}`);
          console.log(`     Source: ${txn.source_type} | Amount: ₹${(txn.amount_paise / 100).toFixed(2)}`);
          console.log(`     Status: ${txn.status}`);
          console.log(`     Business Date: ${txn.transaction_date.toISOString().split('T')[0]}`);
          console.log(`     Inserted: ${istCreated.toISOString().replace('T', ' ').substring(0, 19)} IST`);
        });
      });
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log('Dashboard showing 30 transactions for Oct 26 because it filters by:');
    console.log('  created_at::date = \'2025-10-26\'');
    console.log('');
    console.log('This includes:');
    console.log(`  - 20 transactions with business date (transaction_date) = Oct 26`);
    console.log(`  - ${result.rows.length} transactions with business date = OTHER but inserted on Oct 26`);
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

findAdditional10();
