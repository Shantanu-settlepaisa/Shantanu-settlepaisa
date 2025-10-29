const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function updateOct27Batch() {
  const client = await pool.connect();

  try {
    console.log('========================================');
    console.log('UPDATE OCT 27 BATCH WITH BANK CHARGES');
    console.log('========================================\n');

    // Get Oct 27 batch
    const batchQuery = `
      SELECT
        id,
        merchant_id,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        total_bank_charges_paise,
        settlepaisa_revenue_paise,
        net_amount_paise
      FROM sp_v2_settlement_batches
      WHERE DATE(cycle_date) = '2025-10-27'
    `;

    const batchResult = await client.query(batchQuery);

    if (batchResult.rowCount === 0) {
      console.log('⚠️  No settlement batch found for Oct 27');
      return;
    }

    const batch = batchResult.rows[0];

    console.log('Current Batch State:');
    console.log(`  ID: ${batch.id}`);
    console.log(`  Merchant: ${batch.merchant_id}`);
    console.log(`  Transactions: ${batch.total_transactions}`);
    console.log(`  Gross Amount: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
    console.log(`  Commission: ₹${(batch.total_commission_paise / 100).toFixed(2)}`);
    console.log(`  GST: ₹${(batch.total_gst_paise / 100).toFixed(2)}`);
    console.log(`  Bank Charges: ₹${((batch.total_bank_charges_paise || 0) / 100).toFixed(2)}`);
    console.log(`  SettlePaisa Revenue: ₹${((batch.settlepaisa_revenue_paise || 0) / 100).toFixed(2)}`);
    console.log(`  Net Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}\n`);

    // Calculate correct values
    // For now, bank charges = 0 (no bank charges in our test data)
    // SettlePaisa Revenue = total_commission (we take full commission)
    const totalBankCharges = 0;
    const settlepaisaRevenue = batch.total_commission_paise;

    console.log('Calculated Values:');
    console.log(`  Bank Charges: ₹${(totalBankCharges / 100).toFixed(2)}`);
    console.log(`  SettlePaisa Revenue: ₹${(settlepaisaRevenue / 100).toFixed(2)}\n`);

    // Update batch
    const updateQuery = `
      UPDATE sp_v2_settlement_batches
      SET
        total_bank_charges_paise = $1,
        settlepaisa_revenue_paise = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        total_bank_charges_paise,
        settlepaisa_revenue_paise
    `;

    const updateResult = await client.query(updateQuery, [
      totalBankCharges,
      settlepaisaRevenue,
      batch.id
    ]);

    const updated = updateResult.rows[0];

    console.log('✅ Batch Updated Successfully!');
    console.log(`  Batch ID: ${updated.id}`);
    console.log(`  Bank Charges: ₹${(updated.total_bank_charges_paise / 100).toFixed(2)}`);
    console.log(`  SettlePaisa Revenue: ₹${(updated.settlepaisa_revenue_paise / 100).toFixed(2)}\n`);

    console.log('========================================');
    console.log('UPDATE COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ Error updating batch:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateOct27Batch().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
