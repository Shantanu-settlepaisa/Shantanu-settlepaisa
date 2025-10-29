const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  user: 'postgres',
  password: 'SettlePaisa2024',
  database: 'settlepaisa_v2',
  port: 5432
});

async function checkData() {
  try {
    // Check utr_credits count
    const creditResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_utr_credits
      WHERE credited_at::date BETWEEN '2025-10-09' AND '2025-10-14'
    `);
    console.log('sp_v2_utr_credits count:', creditResult.rows[0].count);

    // Check sample utr_credits
    const sampleCredits = await pool.query(`
      SELECT utr, amount_paise, credited_at
      FROM sp_v2_utr_credits
      WHERE credited_at::date BETWEEN '2025-10-09' AND '2025-10-14'
      LIMIT 3
    `);
    console.log('\nSample utr_credits:', sampleCredits.rows);

    // Check what the current query returns
    const bankMIS = await pool.query(`
      SELECT
        c.id as bank_statement_id,
        c.utr,
        c.amount_paise as bank_amount_paise,
        c.credited_at::date as bank_date,
        t.transaction_id,
        t.amount_paise as pg_amount_paise,
        t.created_at::date as pg_date
      FROM sp_v2_utr_credits c
      LEFT JOIN sp_v2_transactions t ON c.utr = t.utr
      WHERE c.credited_at::date BETWEEN '2025-10-09' AND '2025-10-14'
      LIMIT 3
    `);
    console.log('\nBank MIS query result:', bankMIS.rows);

    // Check transactions count
    const txnResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE created_at::date BETWEEN '2025-10-09' AND '2025-10-14'
    `);
    console.log('\nsp_v2_transactions count:', txnResult.rows[0].count);

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkData();
