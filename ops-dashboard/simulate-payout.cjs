#!/usr/bin/env node

/**
 * Settlement Payout Simulator
 *
 * This script simulates the payout processing flow for approved settlements.
 * It moves settlements through: APPROVED → TRANSFERRED → CREDITED
 *
 * Usage: node simulate-payout.cjs [--dry-run]
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const PROCESSING_DELAY_MS = 2000; // Simulate bank API call
const VERIFICATION_DELAY_MS = 3000; // Simulate verification

// Utility function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Format currency
const formatCurrency = (paise) => {
  return `₹${(paise / 100).toFixed(2)}`;
};

// Generate mock UTR
const generateUTR = () => {
  const timestamp = Date.now();
  return `UTR_${timestamp}_${Math.random().toString(36).substring(7).toUpperCase()}`;
};

console.log('\n🚀 Settlement Payout Simulator');
console.log('━'.repeat(50));
if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No changes will be made\n');
}

async function simulatePayouts() {
  const client = await pool.connect();

  try {
    // Step 1: Find pending bank transfers
    console.log('📋 Finding pending bank transfers...\n');

    const pendingResult = await client.query(`
      SELECT
        bt.id as transfer_id,
        bt.settlement_batch_id,
        bt.merchant_id,
        bt.amount_paise,
        bt.bank_account_number,
        bt.ifsc_code,
        bt.transfer_mode,
        sb.status as batch_status,
        sb.net_amount_paise
      FROM sp_v2_settlement_bank_transfers bt
      JOIN sp_v2_settlement_batches sb ON sb.id = bt.settlement_batch_id
      WHERE bt.status = 'PENDING'
      ORDER BY bt.created_at
    `);

    const pendingTransfers = pendingResult.rows;

    if (pendingTransfers.length === 0) {
      console.log('✨ No pending transfers found!');
      console.log('\nℹ️  To create pending transfers:');
      console.log('   1. Go to http://localhost:5174/ops/settlements');
      console.log('   2. Click "Approve" on a settlement batch');
      console.log('   3. Run this script again\n');
      return;
    }

    console.log(`Found ${pendingTransfers.length} pending bank transfer(s)\n`);

    // Step 2: Process each transfer
    for (let i = 0; i < pendingTransfers.length; i++) {
      const transfer = pendingTransfers[i];
      const num = i + 1;

      console.log(`[${num}/${pendingTransfers.length}] Processing settlement ${transfer.settlement_batch_id.substring(0, 8)}...`);
      console.log(`   Merchant: ${transfer.merchant_id}`);
      console.log(`   Amount: ${formatCurrency(transfer.amount_paise)}`);
      console.log(`   Transfer Mode: ${transfer.transfer_mode}`);

      if (DRY_RUN) {
        console.log('   [DRY RUN] Would update to PROCESSING');
        console.log('   [DRY RUN] Would update to TRANSFERRED');
        console.log('   [DRY RUN] Would update to COMPLETED');
        console.log('   [DRY RUN] Would update to CREDITED\n');
        continue;
      }

      // Begin transaction
      await client.query('BEGIN');

      try {
        // Step 2a: Mark as PROCESSING (simulate bank API call)
        const utr = generateUTR();

        await client.query(`
          UPDATE sp_v2_settlement_bank_transfers
          SET
            status = 'PROCESSING',
            utr_number = $1,
            processing_started_at = NOW(),
            updated_at = NOW()
          WHERE id = $2
        `, [utr, transfer.transfer_id]);

        await client.query(`
          UPDATE sp_v2_settlement_batches
          SET
            status = 'TRANSFERRED',
            updated_at = NOW()
          WHERE id = $1
        `, [transfer.settlement_batch_id]);

        console.log(`   ✓ Updated to PROCESSING (UTR: ${utr})`);
        console.log(`   ✓ Batch marked as TRANSFERRED`);

        // Simulate bank processing time
        console.log(`   ⏳ Simulating bank processing (${PROCESSING_DELAY_MS / 1000}s)...`);
        await sleep(PROCESSING_DELAY_MS);

        // Step 2b: Simulate verification
        console.log(`   ⏳ Simulating verification (${VERIFICATION_DELAY_MS / 1000}s)...`);
        await sleep(VERIFICATION_DELAY_MS);

        // Step 2c: Mark as COMPLETED (verification successful)
        await client.query(`
          UPDATE sp_v2_settlement_bank_transfers
          SET
            status = 'COMPLETED',
            verification_status = 'VERIFIED',
            verification_method = 'MANUAL_SIMULATION',
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `, [transfer.transfer_id]);

        await client.query(`
          UPDATE sp_v2_settlement_batches
          SET
            status = 'CREDITED',
            updated_at = NOW()
          WHERE id = $1
        `, [transfer.settlement_batch_id]);

        console.log(`   ✓ Verification complete`);
        console.log(`   ✓ Batch marked as CREDITED`);
        console.log(`   ✅ Settlement completed!\n`);

        // Commit transaction
        await client.query('COMMIT');

      } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.log(`   ❌ Error processing transfer: ${error.message}\n`);
        throw error;
      }
    }

    // Summary
    console.log('━'.repeat(50));
    console.log(`✅ Complete! Processed ${pendingTransfers.length} settlement(s)`);
    console.log('\n📊 Next steps:');
    console.log('   1. Refresh the Settlements page (http://localhost:5174/ops/settlements)');
    console.log('   2. Check "Transferred" and "Credited" tabs');
    console.log('   3. Summary tiles should now show data\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run the simulation
simulatePayouts()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    pool.end();
    process.exit(1);
  });
