#!/usr/bin/env node

/**
 * Setup Local Test Data for Overwrite Protection Testing
 *
 * Creates test transactions with different statuses:
 * - Oct 27: PENDING (safe to overwrite)
 * - Oct 28: RECONCILED (safe to overwrite)
 * - Oct 29: SETTLED (should block overwrite)
 * - Oct 30: MIXED (should block due to settled)
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function setupTestData() {
  const client = await pool.connect();

  try {
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║     SETTING UP LOCAL TEST DATA FOR OVERWRITE PROTECTION TESTING      ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

    // Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await client.query(`
      DELETE FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TEST_LOCAL_%'
    `);
    console.log('✅ Cleanup complete\n');

    // Scenario 1: PENDING transactions (Oct 27) - Safe to overwrite
    console.log('📝 Scenario 1: Creating PENDING transactions for 2025-10-27');
    await client.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, transaction_date, transaction_timestamp,
        payment_method, status, source_type, created_at
      ) VALUES
      ('TEST_LOCAL_PENDING_001', 'MERCH001', 10000, '2025-10-27', '2025-10-27 10:00:00', 'UPI', 'PENDING', 'MANUAL_UPLOAD', NOW()),
      ('TEST_LOCAL_PENDING_002', 'MERCH001', 20000, '2025-10-27', '2025-10-27 11:00:00', 'UPI', 'PENDING', 'MANUAL_UPLOAD', NOW())
    `);
    console.log('   ✅ Created 2 PENDING transactions');
    console.log('   → Should ALLOW overwrite (no settlement)\n');

    // Scenario 2: RECONCILED transactions (Oct 28) - Safe to overwrite
    console.log('📝 Scenario 2: Creating RECONCILED transactions for 2025-10-28');
    await client.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, transaction_date, transaction_timestamp,
        payment_method, status, source_type, created_at
      ) VALUES
      ('TEST_LOCAL_RECON_001', 'MERCH001', 30000, '2025-10-28', '2025-10-28 10:00:00', 'UPI', 'RECONCILED', 'MANUAL_UPLOAD', NOW()),
      ('TEST_LOCAL_RECON_002', 'MERCH001', 40000, '2025-10-28', '2025-10-28 11:00:00', 'UPI', 'RECONCILED', 'MANUAL_UPLOAD', NOW())
    `);
    console.log('   ✅ Created 2 RECONCILED transactions');
    console.log('   → Should ALLOW overwrite (reconciliation data will be cleaned)\n');

    // Scenario 3: SETTLED transactions (Oct 29) - Should block overwrite
    console.log('📝 Scenario 3: Creating SETTLED transactions for 2025-10-29');
    await client.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, transaction_date, transaction_timestamp,
        payment_method, status, source_type, created_at
      ) VALUES
      ('TEST_LOCAL_SETTLED_001', 'MERCH001', 50000, '2025-10-29', '2025-10-29 10:00:00', 'UPI', 'SETTLED', 'MANUAL_UPLOAD', NOW()),
      ('TEST_LOCAL_SETTLED_002', 'MERCH001', 60000, '2025-10-29', '2025-10-29 11:00:00', 'UPI', 'SETTLED', 'MANUAL_UPLOAD', NOW())
    `);
    console.log('   ✅ Created 2 SETTLED transactions');
    console.log('   ⚠️  Should BLOCK overwrite (protection should trigger)\n');

    // Scenario 4: Mixed status (Oct 30) - Should block due to settled
    console.log('📝 Scenario 4: Creating MIXED status transactions for 2025-10-30');
    await client.query(`
      INSERT INTO sp_v2_transactions (
        transaction_id, merchant_id, amount_paise, transaction_date, transaction_timestamp,
        payment_method, status, source_type, created_at
      ) VALUES
      ('TEST_LOCAL_MIXED_PENDING', 'MERCH001', 15000, '2025-10-30', '2025-10-30 10:00:00', 'UPI', 'PENDING', 'MANUAL_UPLOAD', NOW()),
      ('TEST_LOCAL_MIXED_RECON', 'MERCH001', 25000, '2025-10-30', '2025-10-30 11:00:00', 'UPI', 'RECONCILED', 'MANUAL_UPLOAD', NOW()),
      ('TEST_LOCAL_MIXED_SETTLED', 'MERCH001', 35000, '2025-10-30', '2025-10-30 12:00:00', 'UPI', 'SETTLED', 'MANUAL_UPLOAD', NOW())
    `);
    console.log('   ✅ Created 3 transactions (1 PENDING, 1 RECONCILED, 1 SETTLED)');
    console.log('   ⚠️  Should BLOCK overwrite (any settled = protect entire batch)\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('✅ TEST DATA SETUP COMPLETE\n');

    console.log('Test Scenarios Ready:');
    console.log('  1. 2025-10-27: PENDING only     → Overwrite should SUCCEED ✅');
    console.log('  2. 2025-10-28: RECONCILED only  → Overwrite should SUCCEED ✅');
    console.log('  3. 2025-10-29: SETTLED only     → Overwrite should FAIL ❌');
    console.log('  4. 2025-10-30: MIXED statuses   → Overwrite should FAIL ❌\n');

    // Verify data
    const verifyQuery = await client.query(`
      SELECT
        DATE(transaction_date) as date,
        status,
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TEST_LOCAL_%'
      GROUP BY DATE(transaction_date), status
      ORDER BY date, status
    `);

    console.log('Database Verification:');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    verifyQuery.rows.forEach(row => {
      console.log(`  ${row.date}: ${row.status.padEnd(12)} → ${row.count} transactions`);
    });
    console.log('\n');

  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupTestData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
