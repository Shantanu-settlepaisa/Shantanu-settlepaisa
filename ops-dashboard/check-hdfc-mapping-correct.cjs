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
      WHERE config_name = 'HDFC BANK'
    `);

    console.log('Found mapping:');
    console.log('config_name:', result.rows[0].config_name);
    console.log('bank_name:', result.rows[0].bank_name);
    console.log('file_type:', result.rows[0].file_type);
    console.log('\nv1_column_mappings:');
    console.log(JSON.stringify(result.rows[0].v1_column_mappings, null, 2));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkMapping();
