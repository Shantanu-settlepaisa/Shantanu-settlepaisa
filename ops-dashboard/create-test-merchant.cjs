const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function createTestMerchant() {
  try {
    console.log('Creating test merchant MERCH_ABC...');

    const result = await pool.query(`
      INSERT INTO sp_v2_merchant_configs (
        merchant_id,
        merchant_name,
        default_mdr_percentage,
        settlement_cycle,
        is_active
      ) VALUES (
        'MERCH_ABC',
        'Test Merchant ABC',
        2.0,
        'T+1',
        true
      )
      ON CONFLICT (merchant_id) DO UPDATE SET
        is_active = true,
        default_mdr_percentage = 2.0
      RETURNING *
    `);

    console.log('✓ Merchant created/updated:', result.rows[0]);

    // Also create fee configuration
    const feeResult = await pool.query(`
      INSERT INTO sp_v2_merchant_fee_configs (
        merchant_id,
        payment_method,
        fee_type,
        fee_value,
        is_active
      ) VALUES
        ('MERCH_ABC', 'UPI', 'PERCENTAGE', 1.5, true),
        ('MERCH_ABC', 'NETBANKING', 'PERCENTAGE', 2.0, true),
        ('MERCH_ABC', 'CARD', 'PERCENTAGE', 2.5, true),
        ('MERCH_ABC', 'WALLET', 'PERCENTAGE', 1.8, true)
      ON CONFLICT (merchant_id, payment_method) DO UPDATE SET
        is_active = true
      RETURNING merchant_id, payment_method, fee_value
    `);

    console.log(`✓ Created ${feeResult.rowCount} fee configurations`);
    feeResult.rows.forEach(row => {
      console.log(`  - ${row.payment_method}: ${row.fee_value}%`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

createTestMerchant();
