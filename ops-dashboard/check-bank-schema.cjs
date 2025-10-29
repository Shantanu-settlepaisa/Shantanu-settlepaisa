const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkSchema() {
  try {
    // Get bank_statements columns
    const schemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_bank_statements'
      ORDER BY ordinal_position
    `);
    
    console.log('sp_v2_bank_statements columns:');
    console.log('-'.repeat(50));
    schemaResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Now check actual data
    console.log('\n\nBank statements data for Oct 28:');
    console.log('-'.repeat(50));
    const dataResult = await pool.query(`
      SELECT
        utr,
        bank_ref,
        amount_paise / 100.0 as amount,
        bank_name,
        status
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY utr
      LIMIT 5
    `);
    
    if (dataResult.rows.length === 0) {
      console.log('❌ NO bank statements found!');
    } else {
      console.log(`Found ${dataResult.rows.length} statements:`);
      dataResult.rows.forEach(row => {
        console.log(`  ${row.utr}: ₹${row.amount} (${row.bank_name})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
