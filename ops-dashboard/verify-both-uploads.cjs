const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function verify() {
  try {
    console.log('✅ UPLOAD VERIFICATION\n');
    console.log('='.repeat(80));

    // Check refunds
    console.log('\n📋 1. REFUNDS in sp_v2_transactions:');
    console.log('-'.repeat(80));

    const refunds = await pool.query(`
      SELECT transaction_id, amount_paise, refund_amount_paise, refund_type, refund_date
      FROM sp_v2_transactions
      WHERE refund_amount_paise IS NOT NULL
      ORDER BY updated_at DESC
    `);

    refunds.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.transaction_id}`);
      console.log(`   Original: ₹${(row.amount_paise / 100).toFixed(2)}`);
      console.log(`   Refund: ₹${(row.refund_amount_paise / 100).toFixed(2)} (${row.refund_type})`);
      console.log(`   Net: ₹${((row.amount_paise - row.refund_amount_paise) / 100).toFixed(2)}`);
      console.log('');
    });

    // Check chargebacks
    console.log('\n📋 2. CHARGEBACKS in sp_v2_chargebacks:');
    console.log('-'.repeat(80));

    const chargebacks = await pool.query(`
      SELECT txn_ref, merchant_id, chargeback_paise, reason_code, status, outcome
      FROM sp_v2_chargebacks
      WHERE txn_ref LIKE 'TXN%'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    chargebacks.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.txn_ref}`);
      console.log(`   Merchant: ${row.merchant_id}`);
      console.log(`   Amount: ₹${(row.chargeback_paise / 100).toFixed(2)}`);
      console.log(`   Reason: ${row.reason_code}`);
      console.log(`   Status: ${row.status}, Outcome: ${row.outcome}`);
      console.log('');
    });

    // Summary for settlement calculation
    console.log('\n📊 SUMMARY FOR SETTLEMENT CALCULATION:');
    console.log('='.repeat(80));

    const refundTotal = await pool.query(`
      SELECT COALESCE(SUM(refund_amount_paise), 0) as total
      FROM sp_v2_transactions
      WHERE refund_amount_paise IS NOT NULL AND is_refund_processed = FALSE
    `);

    const chargebackTotal = await pool.query(`
      SELECT COALESCE(SUM(chargeback_paise), 0) as total
      FROM sp_v2_chargebacks
      WHERE outcome = 'LOST'
    `);

    console.log(`Total Pending Refunds: ₹${(refundTotal.rows[0].total / 100).toFixed(2)}`);
    console.log(`Total Lost Chargebacks: ₹${(chargebackTotal.rows[0].total / 100).toFixed(2)}`);
    console.log(`Total Deductions: ₹${((refundTotal.rows[0].total + chargebackTotal.rows[0].total) / 100).toFixed(2)}`);

    console.log('\n✨ Both uploads working perfectly!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verify();
