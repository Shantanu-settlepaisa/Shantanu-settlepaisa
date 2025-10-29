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
    console.log('Creating sp_v2_merchants table if not exists...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sp_v2_merchants (
        id SERIAL PRIMARY KEY,
        merchant_id VARCHAR(100) UNIQUE NOT NULL,
        merchant_name VARCHAR(255),
        rolling_reserve DECIMAL(5,2) DEFAULT 0,
        rolling_percentage DECIMAL(5,2) DEFAULT 0,
        no_of_days INTEGER DEFAULT 1,
        subscribe BOOLEAN DEFAULT false,
        subscribe_amount DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('Inserting MERCH001 merchant...');
    
    const result = await pool.query(`
      INSERT INTO sp_v2_merchants (
        merchant_id, merchant_name, rolling_reserve, rolling_percentage, 
        no_of_days, subscribe, subscribe_amount, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (merchant_id) DO UPDATE SET
        merchant_name = EXCLUDED.merchant_name,
        is_active = EXCLUDED.is_active
      RETURNING id, merchant_id, merchant_name
    `, ['MERCH001', 'Test Merchant 001', 0, 0, 1, false, 0, true]);
    
    console.log('✅ Merchant created:', result.rows[0]);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();
