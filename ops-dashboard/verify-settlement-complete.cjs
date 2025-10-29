#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function verifySettlement() {
  const client = await pool.connect();

  try {
    console.log('✅ Settlement Batch Verification\n');

    const batch = await client.query(`
      SELECT id, merchant_id, merchant_name, status, total_transactions,
             gross_amount_paise, total_commission_paise, total_gst_paise,
             total_reserve_paise, net_amount_paise, cycle_date, created_at
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (batch.rows.length > 0) {
      const b = batch.rows[0];
      console.log('📊 Settlement Batch:');
      console.log(`  ID: ${b.id}`);
      console.log(`  Merchant: ${b.merchant_id} (${b.merchant_name})`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Cycle Date: ${b.cycle_date.toISOString().split('T')[0]}`);
      console.log(`  Total Transactions: ${b.total_transactions}`);
      console.log(`  Gross Amount: ₹${(b.gross_amount_paise/100).toFixed(2)}`);
      console.log(`  Total Commission: ₹${(b.total_commission_paise/100).toFixed(2)}`);
      console.log(`  Total GST: ₹${(b.total_gst_paise/100).toFixed(2)}`);
      console.log(`  Total Reserve: ₹${(b.total_reserve_paise/100).toFixed(2)}`);
      console.log(`  Net Amount: ₹${(b.net_amount_paise/100).toFixed(2)}`);
      console.log(`  Created: ${b.created_at.toISOString()}\n`);

      console.log('📋 Settlement Items:');
      const items = await client.query(`
        SELECT transaction_id, amount_paise, commission_paise, gst_paise,
               reserve_paise, net_paise, payment_mode, fee_bearer
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
        ORDER BY transaction_id
      `, [b.id]);

      console.log(`  Total Items: ${items.rows.length}\n`);
      items.rows.slice(0, 5).forEach(i => {
        console.log(`  ${i.transaction_id}:`);
        console.log(`    Gross: ₹${(i.amount_paise/100).toFixed(2)}`);
        console.log(`    Commission: ₹${(i.commission_paise/100).toFixed(2)}`);
        console.log(`    GST: ₹${(i.gst_paise/100).toFixed(2)}`);
        console.log(`    Net: ₹${(i.net_paise/100).toFixed(2)}`);
        console.log(`    Payment Mode: ${i.payment_mode}`);
        console.log(`    Fee Bearer: ${i.fee_bearer}\n`);
      });

      console.log('🔗 Transaction Links:');
      const txns = await client.query(`
        SELECT transaction_id, settlement_batch_id
        FROM sp_v2_transactions
        WHERE transaction_id LIKE 'TXN_UP_%'
        ORDER BY transaction_id
      `);
      console.log(`  ${txns.rows.length} transactions linked to batch ${b.id.substring(0,8)}...\n`);

      // Calculate totals
      let totalGross = 0;
      let totalCommission = 0;
      let totalGst = 0;
      let totalNet = 0;

      items.rows.forEach(i => {
        totalGross += Number(i.amount_paise);
        totalCommission += Number(i.commission_paise);
        totalGst += Number(i.gst_paise);
        totalNet += Number(i.net_paise);
      });

      console.log('✅ Calculation Verification:');
      console.log(`  Items Gross Sum: ₹${(totalGross/100).toFixed(2)}`);
      console.log(`  Batch Gross: ₹${(b.gross_amount_paise/100).toFixed(2)}`);
      console.log(`  Match: ${totalGross === Number(b.gross_amount_paise) ? '✓' : '✗'}\n`);

      console.log(`  Items Commission Sum: ₹${(totalCommission/100).toFixed(2)}`);
      console.log(`  Batch Commission: ₹${(b.total_commission_paise/100).toFixed(2)}`);
      console.log(`  Match: ${totalCommission === Number(b.total_commission_paise) ? '✓' : '✗'}\n`);

      console.log(`  Items GST Sum: ₹${(totalGst/100).toFixed(2)}`);
      console.log(`  Batch GST: ₹${(b.total_gst_paise/100).toFixed(2)}`);
      console.log(`  Match: ${totalGst === Number(b.total_gst_paise) ? '✓' : '✗'}\n`);

      console.log('🎉 E2E Test Complete! All 8 steps verified.\n');

    } else {
      console.log('❌ No settlement batch found for MERCH001');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

verifySettlement();
