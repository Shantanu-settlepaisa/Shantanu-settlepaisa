#!/usr/bin/env node

/**
 * Create Missing Bank Transfer Records
 *
 * This script creates bank transfer records for APPROVED settlements
 * that don't have them (usually happens with auto-approved batches).
 *
 * Usage: node create-missing-bank-transfers.cjs
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

console.log('\n🔧 Creating Missing Bank Transfer Records');
console.log('━'.repeat(50));

async function createMissingBankTransfers() {
  const client = await pool.connect();

  try {
    // Find APPROVED batches without bank transfer records
    const missingResult = await client.query(`
      SELECT
        sb.id as batch_id,
        sb.merchant_id,
        sb.net_amount_paise,
        sb.status
      FROM sp_v2_settlement_batches sb
      LEFT JOIN sp_v2_settlement_bank_transfers bt ON bt.settlement_batch_id = sb.id
      WHERE sb.status IN ('APPROVED', 'PROCESSING', 'QUEUED')
        AND bt.id IS NULL
      ORDER BY sb.created_at
    `);

    const missingBatches = missingResult.rows;

    if (missingBatches.length === 0) {
      console.log('\n✨ All approved batches have bank transfer records!\n');
      return;
    }

    console.log(`\nFound ${missingBatches.length} batch(es) missing bank transfer records\n`);

    // Create bank transfer records for each
    for (let i = 0; i < missingBatches.length; i++) {
      const batch = missingBatches[i];
      const num = i + 1;

      console.log(`[${num}/${missingBatches.length}] Creating transfer for batch ${batch.batch_id.substring(0, 8)}...`);
      console.log(`   Merchant: ${batch.merchant_id}`);
      console.log(`   Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);

      await client.query('BEGIN');

      try {
        // Get merchant bank config
        const configResult = await client.query(`
          SELECT
            account_number,
            account_holder_name,
            ifsc_code,
            bank_name,
            preferred_transfer_mode
          FROM sp_v2_merchant_settlement_config
          WHERE merchant_id = $1
            AND is_active = true
          LIMIT 1
        `, [batch.merchant_id]);

        let config;
        if (configResult.rows.length === 0) {
          console.log('   ⚠️  No merchant config found, using defaults');
          // Use defaults for test merchants
          config = {
            account_number: '1234567890',
            account_holder_name: `Test Merchant ${batch.merchant_id}`,
            ifsc_code: 'HDFC0000123',
            bank_name: 'HDFC Bank',
            preferred_transfer_mode: 'NEFT',
          };
        } else {
          config = configResult.rows[0];
        }

        // Create bank transfer record
        await client.query(`
          INSERT INTO sp_v2_settlement_bank_transfers (
            settlement_batch_id,
            merchant_id,
            bank_account_number,
            ifsc_code,
            amount_paise,
            transfer_mode,
            status,
            initiated_at,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW(), NOW())
        `, [
          batch.batch_id,
          batch.merchant_id,
          config.account_number,
          config.ifsc_code,
          batch.net_amount_paise,
          config.preferred_transfer_mode || 'NEFT',
        ]);

        console.log(`   ✓ Bank transfer record created (status: PENDING)`);

        await client.query('COMMIT');
        console.log(`   ✅ Done!\n`);

      } catch (error) {
        await client.query('ROLLBACK');
        console.log(`   ❌ Error: ${error.message}\n`);
        throw error;
      }
    }

    console.log('━'.repeat(50));
    console.log(`✅ Complete! Created ${missingBatches.length} bank transfer record(s)`);
    console.log('\n📊 Next steps:');
    console.log('   Run: node simulate-payout.cjs\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

createMissingBankTransfers()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    pool.end();
    process.exit(1);
  });
