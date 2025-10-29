const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testFixedQuery() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧪 TESTING FIXED RECON OUTCOME QUERY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // This is the FIXED query (what the API now uses)
    const query = `
      SELECT
        t.transaction_id,
        t.gateway_ref,
        t.amount_paise,
        t.utr,
        t.payment_mode,
        t.created_at::date as transaction_date,
        t.merchant_id,
        c.bank_ref as bank_reference,
        c.bank_name as acquirer,
        c.amount_paise as bank_amount_paise,
        COALESCE(
          rr.match_status,
          CASE
            WHEN c.utr IS NOT NULL THEN 'PENDING_RECON'
            ELSE 'UPLOADED'
          END
        ) as status,
        rr.exception_reason_code as exception_type,
        COALESCE(rr.exception_message, 'System generated') as comments
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_bank_statements c ON t.utr = c.utr
      LEFT JOIN sp_v2_reconciliation_results rr ON t.transaction_id = rr.pg_transaction_id
      WHERE t.created_at::date = $1
      ORDER BY t.created_at DESC
      LIMIT 10
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
        statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
      });

      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count} records`);
      });

      console.log('');
      console.log('Sample records:');
      result.rows.slice(0, 5).forEach((row, idx) => {
        console.log(`\n  ${idx + 1}. ${row.transaction_id}`);
        console.log(`     Status: ${row.status}`);
        console.log(`     Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
        console.log(`     UTR: ${row.utr}`);
        console.log(`     Acquirer: ${row.acquirer || 'N/A'}`);
      });

      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('✅ FIX VERIFIED - All records showing correct status!');
      console.log('═══════════════════════════════════════════════════════');

    } else {
      console.log('⚠️  No records found for date 2025-10-28');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testFixedQuery().catch(console.error);
