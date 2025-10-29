const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testBankMISQuery() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧪 TESTING BANK MIS QUERY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // This is the Bank MIS query (already correct in the API)
    const query = `
      SELECT
        c.id as bank_statement_id,
        c.utr,
        c.amount_paise as bank_amount_paise,
        c.transaction_date::date as bank_date,
        c.bank_ref as bank_reference,
        c.bank_name as acquirer,
        t.transaction_id,
        t.gateway_ref,
        t.amount_paise as pg_amount_paise,
        t.created_at::date as pg_date,
        t.merchant_id,
        t.payment_mode,
        COALESCE(
          rr.match_status,
          CASE
            WHEN t.transaction_id IS NOT NULL THEN 'PENDING_RECON'
            ELSE 'UPLOADED'
          END
        ) as match_status,
        COALESCE(
          rr.exception_reason_code,
          CASE WHEN t.transaction_id IS NULL THEN 'NOT_RECONCILED' ELSE NULL END
        ) as exception_reason_code,
        rr.exception_message,
        COALESCE(rr.variance_paise, (t.amount_paise - c.amount_paise)) as delta_paise
      FROM sp_v2_bank_statements c
      LEFT JOIN sp_v2_transactions t ON c.utr = t.utr
      LEFT JOIN sp_v2_reconciliation_results rr ON c.id = rr.bank_statement_id
      WHERE c.transaction_date::date = $1
      ORDER BY c.transaction_date DESC
      LIMIT 20
    `;

    const result = await client.query(query, ['2025-10-28']);

    console.log('Query Results:');
    console.log('  Total rows:', result.rows.length);
    console.log('');

    if (result.rows.length > 0) {
      console.log('✅ SUCCESS! Query returned data.');
      console.log('');
      console.log('Status breakdown:');

      const statusCounts = {};
      result.rows.forEach(row => {
        statusCounts[row.match_status] = (statusCounts[row.match_status] || 0) + 1;
      });

      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count} records`);
      });

      console.log('');
      console.log('Sample records:');
      result.rows.slice(0, 5).forEach((row, idx) => {
        console.log(`\n  ${idx + 1}. Bank Statement ID: ${row.bank_statement_id}`);
        console.log(`     UTR: ${row.utr}`);
        console.log(`     Bank Amount: ₹${(row.bank_amount_paise / 100).toFixed(2)}`);
        console.log(`     PG Transaction: ${row.transaction_id || 'None'}`);
        console.log(`     Match Status: ${row.match_status}`);
        console.log(`     Delta: ₹${((row.delta_paise || 0) / 100).toFixed(2)}`);
      });

      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('✅ BANK MIS QUERY WORKING CORRECTLY!');
      console.log('');
      console.log('📝 IMPORTANT: To see this data in the UI, filter by:');
      console.log('   Cycle Date: 28/10/2025 (or 2025-10-28)');
      console.log('═══════════════════════════════════════════════════════');

    } else {
      console.log('⚠️  No records found for date 2025-10-28');
      console.log('');
      console.log('Checking what dates are available...');

      const datesResult = await client.query(`
        SELECT DISTINCT transaction_date::date as date, COUNT(*) as count
        FROM sp_v2_bank_statements
        GROUP BY transaction_date::date
        ORDER BY date DESC
        LIMIT 5
      `);

      console.log('Available dates in bank_statements:');
      datesResult.rows.forEach(row => {
        console.log(`  ${row.date}: ${row.count} statements`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testBankMISQuery().catch(console.error);
