const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkSettlementTables() {
  try {
    console.log('========== SETTLEMENT TABLES CHECK ==========\n');

    // Check settlement batches
    const batches = await pool.query(`
      SELECT
        id,
        merchant_id,
        total_transactions,
        gross_amount_paise,
        net_amount_paise,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`💰 Settlement Batches (last 10 min): ${batches.rows.length}`);
    batches.rows.forEach(row => {
      console.log(`   Batch ID: ${row.id}`);
      console.log(`     Merchant: ${row.merchant_id}`);
      console.log(`     Transactions: ${row.total_transactions}`);
      console.log(`     Gross: ₹${(row.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`     Net: ₹${(row.net_amount_paise / 100).toFixed(2)}`);
      console.log(`     Status: ${row.status}`);
      console.log(`     Created: ${row.created_at.toISOString()}`);
      console.log('');
    });

    // Check settlement items
    if (batches.rows.length > 0) {
      const batchIds = batches.rows.map(r => `'${r.id}'`).join(',');
      const items = await pool.query(`
        SELECT COUNT(*) as count
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id::text IN (${batchIds})
      `);
      console.log(`📦 Settlement Items: ${items.rows[0].count}`);
    }

    // Check transactions linked to settlement
    const linkedTxns = await pool.query(`
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      WHERE settlement_batch_id IS NOT NULL
        AND transaction_id LIKE 'TXN_E2E%'
    `);
    console.log(`🔗 E2E Transactions linked to settlement: ${linkedTxns.rows[0].count}`);

    // Check reconciliation status
    const reconStatus = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_id LIKE 'TXN_E2E%'
      GROUP BY status
    `);
    console.log('\n📊 E2E Transaction Status:');
    reconStatus.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    console.log('\n=========================================');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSettlementTables();
