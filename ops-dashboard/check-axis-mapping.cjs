const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function main() {
  const client = await pool.connect();

  try {
    console.log('');
    console.log('=== CHECKING AXIS BANK MAPPING ===');
    console.log('');

    // Query exactly as v1-mapper does
    const result = await client.query(`
      SELECT config_name, bank_name, v1_column_mappings, special_fields, is_active
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) = UPPER($1) AND is_active = true
      LIMIT 1
    `, ['AXIS BANK']);

    console.log('Rows found:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('');
      console.log('NO MAPPING FOUND!');
      console.log('This explains why it uses hardcoded fallback.');
      console.log('');

      // Check if mapping exists but is_active = false
      const inactiveResult = await client.query(`
        SELECT config_name, bank_name, is_active
        FROM sp_v2_bank_column_mappings
        WHERE UPPER(bank_name) = UPPER($1)
      `, ['AXIS BANK']);

      if (inactiveResult.rows.length > 0) {
        console.log('Found INACTIVE mapping:');
        console.log('  config_name:', inactiveResult.rows[0].config_name);
        console.log('  is_active:', inactiveResult.rows[0].is_active);
      } else {
        console.log('No mapping exists at all (active or inactive)');
      }
    } else {
      const row = result.rows[0];
      console.log('');
      console.log('MAPPING FOUND:');
      console.log('  config_name:', row.config_name);
      console.log('  bank_name:', row.bank_name);
      console.log('  is_active:', row.is_active);
      console.log('  v1_column_mappings:', JSON.stringify(row.v1_column_mappings, null, 2));
    }

  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
