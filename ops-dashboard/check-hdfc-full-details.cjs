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
        id,
        config_name,
        bank_name,
        file_type,
        delimiter,
        v1_column_mappings,
        special_fields,
        date_format,
        amount_format,
        is_active,
        source
      FROM sp_v2_bank_column_mappings
      WHERE bank_name ILIKE '%HDFC%'
      ORDER BY config_name
    `);

    console.log(`Found ${result.rows.length} HDFC mappings:\n`);

    result.rows.forEach((row, idx) => {
      console.log(`\n=== Mapping ${idx + 1}: ${row.config_name} ===`);
      console.log('Bank Name:', row.bank_name);
      console.log('File Type:', row.file_type);
      console.log('Delimiter:', row.delimiter);
      console.log('Date Format:', row.date_format);
      console.log('Amount Format:', row.amount_format);
      console.log('Active:', row.is_active);
      console.log('Source:', row.source);
      console.log('\nv1_column_mappings:');
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));
      if (row.special_fields) {
        console.log('\nspecial_fields:');
        console.log(JSON.stringify(row.special_fields, null, 2));
      }
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkMapping();
