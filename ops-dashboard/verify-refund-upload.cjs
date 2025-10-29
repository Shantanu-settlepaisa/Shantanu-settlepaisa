const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function verifyRefunds() {
  try {
    console.log('🔍 Verifying refund uploads in database...\n');

    const result = await pool.query(`
      SELECT
        transaction_id,
        amount_paise,
        refund_amount_paise,
        refund_type,
        refund_date,
        is_refund_processed
      FROM sp_v2_transactions
      WHERE refund_amount_paise IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('❌ No refunds found in database\n');
      return;
    }

    console.log(`✅ Found ${result.rows.length} transactions with refunds:\n`);

    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. Transaction: ${row.transaction_id}`);
      console.log(`   Original Amount: ₹${(row.amount_paise / 100).toFixed(2)}`);
      console.log(`   Refund Amount: ₹${(row.refund_amount_paise / 100).toFixed(2)}`);
      console.log(`   Refund Type: ${row.refund_type}`);
      console.log(`   Refund Date: ${row.refund_date}`);
      console.log(`   Processed: ${row.is_refund_processed}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyRefunds();
