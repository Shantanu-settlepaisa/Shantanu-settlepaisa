const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkMappings() {
  try {
    const result = await pool.query(`
      SELECT 
        config_name,
        bank_name,
        file_type,
        is_active
      FROM sp_v2_bank_column_mappings
      ORDER BY config_name
    `);

    console.log(`Found ${result.rows.length} bank mappings:\n`);
    result.rows.forEach(row => {
      console.log(`- ${row.config_name} (${row.bank_name}) - ${row.file_type} - Active: ${row.is_active}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkMappings();
