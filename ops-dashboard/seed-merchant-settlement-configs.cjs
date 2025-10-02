const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function seedMerchantConfigs() {
  console.log('[Seed] Creating merchant settlement configurations...\n');
  
  try {
    const merchants = await pool.query(`
      SELECT DISTINCT merchant_id 
      FROM sp_v2_transactions 
      WHERE merchant_id IS NOT NULL
    `);
    
    console.log(`Found ${merchants.rows.length} unique merchants\n`);
    
    for (const merchant of merchants.rows) {
      const merchantId = merchant.merchant_id;
      
      const config = {
        merchant_id: merchantId,
        merchant_name: `Merchant ${merchantId}`,
        settlement_frequency: 'daily',
        settlement_time: '23:00:00',
        auto_settle: true,
        min_settlement_amount_paise: 10000,
        account_holder_name: `${merchantId} Account Holder`,
        account_number: `ACC${merchantId.replace(/\D/g, '')}`.padEnd(16, '0'),
        ifsc_code: 'HDFC0001234',
        bank_name: 'HDFC Bank',
        branch_name: 'Mumbai Main',
        account_type: 'current',
        preferred_transfer_mode: 'NEFT'
      };
      
      await pool.query(
        `INSERT INTO sp_v2_merchant_settlement_config 
         (merchant_id, merchant_name, settlement_frequency, settlement_time,
          auto_settle, min_settlement_amount_paise, account_holder_name,
          account_number, ifsc_code, bank_name, branch_name, account_type,
          preferred_transfer_mode, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'system')
         ON CONFLICT (merchant_id) DO UPDATE SET
           updated_at = NOW()`,
        [
          config.merchant_id,
          config.merchant_name,
          config.settlement_frequency,
          config.settlement_time,
          config.auto_settle,
          config.min_settlement_amount_paise,
          config.account_holder_name,
          config.account_number,
          config.ifsc_code,
          config.bank_name,
          config.branch_name,
          config.account_type,
          config.preferred_transfer_mode
        ]
      );
      
      console.log(`✅ ${merchantId} - Daily settlement at 11 PM, NEFT transfer`);
    }
    
    const count = await pool.query('SELECT COUNT(*) FROM sp_v2_merchant_settlement_config WHERE is_active = true');
    
    console.log(`\n✅ Seeded ${count.rows[0].count} merchant settlement configurations`);
    
  } catch (error) {
    console.error('❌ Error seeding configs:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

seedMerchantConfigs();
