#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
});

async function verifyCount() {
  const client = await pool.connect();

  try {
    // Count by different date fields
    console.log('Verifying transaction count for Oct 26, 2025...\n');

    const queries = [
      {
        name: 'By transaction_date',
        sql: "SELECT COUNT(*) FROM sp_v2_transactions WHERE transaction_date = '2025-10-26'"
      },
      {
        name: 'By created_at::date',
        sql: "SELECT COUNT(*) FROM sp_v2_transactions WHERE created_at::date = '2025-10-26'"
      },
      {
        name: 'By created_at BETWEEN',
        sql: "SELECT COUNT(*) FROM sp_v2_transactions WHERE created_at::date BETWEEN '2025-10-26' AND '2025-10-26'"
      },
      {
        name: 'Total in table',
        sql: 'SELECT COUNT(*) FROM sp_v2_transactions'
      }
    ];

    for (const q of queries) {
      const result = await client.query(q.sql);
      console.log(`${q.name}: ${result.rows[0].count}`);
    }

    // Show all unique transaction_dates
    console.log('\nAll unique transaction_dates in the table:');
    const dates = await client.query(`
      SELECT transaction_date, COUNT(*) as count
      FROM sp_v2_transactions
      GROUP BY transaction_date
      ORDER BY transaction_date DESC
      LIMIT 10
    `);
    dates.rows.forEach(row => {
      console.log(`  ${row.transaction_date.toISOString().split('T')[0]}: ${row.count} transactions`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyCount();
