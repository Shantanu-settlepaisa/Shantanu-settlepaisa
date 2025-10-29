const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('Creating merchant config for MERCH001...');
    
    const result = await pool.query(`
      INSERT INTO sp_v2_merchant_config (
        merchant_id,
        merchant_name,
        mdr_percentage,
        fixed_fee_paise,
        settlement_cycle_days,
        auto_settlement_enabled,
        settlement_account_number,
        settlement_ifsc,
        settlement_account_name,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (merchant_id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        mdr_percentage = EXCLUDED.mdr_percentage,
        fixed_fee_paise = EXCLUDED.fixed_fee_paise
      RETURNING id, merchant_id, merchant_name
    `, [
      'MERCH001',
      'Test Merchant 001',
      2.5,
      0,
      1,
      true,
      '1234567890',
      'SBIN0001234',
      'Test Merchant Account',
      true
    ]);
    
    console.log('✓ Merchant config created:', result.rows[0]);
    
  } catch (error) {
    console.error('Error creating merchant config:', error.message);
  } finally {
    await pool.end();
  }
})();
