#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
});

async function checkSettlementLinkage() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('Checking Settlement Batch → Transaction Linkage');
    console.log('='.repeat(80));
    console.log('');

    // Get settlement batches for Oct 26
    const batches = await client.query(`
      SELECT
        id,
        merchant_id,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        status
      FROM sp_v2_settlement_batches
      WHERE cycle_date = '2025-10-26'
      ORDER BY created_at DESC
    `);

    console.log(`Found ${batches.rows.length} settlement batches for Oct 26:\n`);

    for (const batch of batches.rows) {
      console.log(`Batch ID: ${batch.id}`);
      console.log(`  Merchant: ${batch.merchant_id}`);
      console.log(`  Claims to have: ${batch.total_transactions} transactions`);
      console.log(`  Claims total: ₹${(batch.gross_amount_paise / 100).toLocaleString()}`);
      console.log(`  Status: ${batch.status}`);

      // Check how many settlement items actually exist
      const items = await client.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
      `, [batch.id]);

      console.log(`  Actually has: ${items.rows[0].count} settlement items`);

      // Check if those settlement items point to valid transactions
      const validItems = await client.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_settlement_items si
        JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
        WHERE si.settlement_batch_id = $1
      `, [batch.id]);

      console.log(`  Valid items (linked to existing transactions): ${validItems.rows[0].count}`);

      if (items.rows[0].count < batch.total_transactions) {
        console.log(`  ⚠️  DISCREPANCY: Batch claims ${batch.total_transactions} but only has ${items.rows[0].count} items!`);
      }

      if (validItems.rows[0].count < items.rows[0].count) {
        console.log(`  ❌ ORPHANED: ${items.rows[0].count - validItems.rows[0].count} items point to deleted transactions!`);
      }

      console.log('');
    }

    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSettlementLinkage();
