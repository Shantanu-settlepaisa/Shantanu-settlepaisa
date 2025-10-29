const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testJoinCondition() {
  const client = await pool.connect();

  try {
    console.log('Testing Recon Outcome API Join Conditions:');
    console.log('');

    // Test 1: WRONG JOIN (what API currently uses)
    console.log('1️⃣  WRONG JOIN: t.id::TEXT = rr.pg_transaction_id');
    const wrongJoinResult = await client.query(`
      SELECT
        t.transaction_id,
        t.id,
        rr.pg_transaction_id,
        COALESCE(
          rr.match_status,
          CASE
            WHEN c.utr IS NOT NULL THEN 'PENDING_RECON'
            ELSE 'UPLOADED'
          END
        ) as status
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_bank_statements c ON t.utr = c.utr
      LEFT JOIN sp_v2_reconciliation_results rr ON t.id::TEXT = rr.pg_transaction_id
      WHERE DATE(t.created_at) = '2025-10-28'
      LIMIT 5
    `);

    wrongJoinResult.rows.forEach((row) => {
      console.log(`   ${row.transaction_id}:`);
      console.log(`     t.id = ${row.id}`);
      console.log(`     rr.pg_transaction_id = ${row.pg_transaction_id || 'NULL'}`);
      console.log(`     Status: ${row.status}`);
      console.log('');
    });

    // Test 2: CORRECT JOIN
    console.log('2️⃣  CORRECT JOIN: t.transaction_id = rr.pg_transaction_id');
    const correctJoinResult = await client.query(`
      SELECT
        t.transaction_id,
        t.id,
        rr.pg_transaction_id,
        COALESCE(
          rr.match_status,
          CASE
            WHEN c.utr IS NOT NULL THEN 'PENDING_RECON'
            ELSE 'UPLOADED'
          END
        ) as status
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_bank_statements c ON t.utr = c.utr
      LEFT JOIN sp_v2_reconciliation_results rr ON t.transaction_id = rr.pg_transaction_id
      WHERE DATE(t.created_at) = '2025-10-28'
      LIMIT 5
    `);

    correctJoinResult.rows.forEach((row) => {
      console.log(`   ${row.transaction_id}:`);
      console.log(`     t.id = ${row.id}`);
      console.log(`     rr.pg_transaction_id = ${row.pg_transaction_id || 'NULL'}`);
      console.log(`     Status: ${row.status}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('CONCLUSION:');
    console.log('');
    console.log('The API is using WRONG join condition:');
    console.log('  Current: LEFT JOIN rr ON t.id::TEXT = rr.pg_transaction_id');
    console.log('  Should be: LEFT JOIN rr ON t.transaction_id = rr.pg_transaction_id');
    console.log('');
    console.log('This causes rr.match_status to be NULL, falling back to "UPLOADED" status.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testJoinCondition().catch(console.error);
