const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkMapping() {
  try {
    const result = await pool.query(`
      SELECT 
        config_name,
        bank_name,
        file_type,
        v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE config_name = 'HDFC_BANK'
    `);

    console.log('Found mapping:', JSON.stringify(result.rows[0], null, 2));
    
    if (result.rows[0]?.v1_column_mappings) {
      console.log('\nv1_column_mappings:', result.rows[0].v1_column_mappings);
      console.log('\nKeys in mapping:', Object.keys(result.rows[0].v1_column_mappings));
      console.log('\ntransaction_id maps to:', result.rows[0].v1_column_mappings.transaction_id);
      console.log('\nutr maps to:', result.rows[0].v1_column_mappings.utr);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkMapping();
