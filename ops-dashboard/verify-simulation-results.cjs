#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function verifyResults() {
  const client = await pool.connect();

  try {
    console.log('\n📊 Settlement Simulation Results Verification\n');
    console.log('━'.repeat(60));

    // Check settlement batches by status
    console.log('\n1️⃣  SETTLEMENT BATCHES BY STATUS:\n');
    const batchesResult = await client.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(net_amount_paise) as total_paise
      FROM sp_v2_settlement_batches
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'PENDING_APPROVAL' THEN 1
          WHEN 'APPROVED' THEN 2
          WHEN 'PROCESSING' THEN 3
          WHEN 'TRANSFERRED' THEN 4
          WHEN 'CREDITED' THEN 5
          ELSE 6
        END
    `);

    batchesResult.rows.forEach(row => {
      const amount = (Number(row.total_paise) / 100).toFixed(2);
      console.log(`   ${row.status.padEnd(20)} | Count: ${String(row.count).padStart(3)} | Total: ₹${amount}`);
    });

    // Check bank transfers by status
    console.log('\n2️⃣  BANK TRANSFERS BY STATUS:\n');
    const transfersResult = await client.query(`
      SELECT
        status,
        verification_status,
        COUNT(*) as count,
        COUNT(utr_number) as utr_count
      FROM sp_v2_settlement_bank_transfers
      GROUP BY status, verification_status
      ORDER BY status
    `);

    transfersResult.rows.forEach(row => {
      const verStatus = row.verification_status || 'NULL';
      console.log(`   ${row.status.padEnd(15)} | Verification: ${verStatus.padEnd(12)} | Count: ${row.count} | UTRs: ${row.utr_count}`);
    });

    // Show recent CREDITED settlements with details
    console.log('\n3️⃣  RECENTLY CREDITED SETTLEMENTS:\n');
    const creditedResult = await client.query(`
      SELECT
        sb.id,
        sb.merchant_id,
        sb.net_amount_paise,
        sb.status as batch_status,
        bt.status as transfer_status,
        bt.utr_number,
        bt.verification_status,
        bt.completed_at
      FROM sp_v2_settlement_batches sb
      JOIN sp_v2_settlement_bank_transfers bt ON bt.settlement_batch_id = sb.id
      WHERE sb.status = 'CREDITED'
      ORDER BY bt.completed_at DESC
      LIMIT 5
    `);

    if (creditedResult.rows.length === 0) {
      console.log('   No credited settlements found.\n');
    } else {
      creditedResult.rows.forEach(row => {
        const amount = (Number(row.net_amount_paise) / 100).toFixed(2);
        const batchId = row.id.substring(0, 8);
        console.log(`   Batch: ${batchId}... | Merchant: ${row.merchant_id}`);
        console.log(`   Amount: ₹${amount} | UTR: ${row.utr_number}`);
        console.log(`   Verification: ${row.verification_status} | Completed: ${row.completed_at}`);
        console.log('');
      });
    }

    console.log('━'.repeat(60));
    console.log('\n✅ Verification Complete!\n');
    console.log('📋 Next Steps:');
    console.log('   1. Refresh Settlements page: http://localhost:5174/ops/settlements');
    console.log('   2. Check "Transferred" and "Credited" tabs');
    console.log('   3. Summary tiles should show updated counts and amounts\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
}

verifyResults().catch(console.error);
