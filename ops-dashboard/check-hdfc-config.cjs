const { Pool } = require('pg');
require('dotenv').config({ path: './services/overview-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkHDFCConfig() {
  try {
    console.log('Checking for HDFC BANK config in RDS...\n');

    const result = await pool.query(`
      SELECT
        bank_name,
        is_active,
        column_mapping
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) IN ('HDFC BANK', 'HDFC_BANK', 'HDFCBANK', 'HDFC')
      ORDER BY is_active DESC, bank_name
    `);

    if (result.rows.length === 0) {
      console.log('❌ NO HDFC BANK config found in database!');
      console.log('\nChecking all bank configs in database...\n');

      const allBanks = await pool.query(`
        SELECT bank_name, is_active
        FROM sp_v2_bank_column_mappings
        ORDER BY is_active DESC, bank_name
      `);

      console.log(`Found ${allBanks.rows.length} bank configs:`);
      allBanks.rows.forEach(row => {
        console.log(`  - ${row.bank_name} (active: ${row.is_active})`);
      });
    } else {
      console.log(`✅ Found ${result.rows.length} HDFC BANK config(s):\n`);
      result.rows.forEach(row => {
        console.log(`Bank: ${row.bank_name}`);
        console.log(`Active: ${row.is_active}`);
        console.log(`Mapping: ${JSON.stringify(row.column_mapping, null, 2)}`);
        console.log('---');
      });
    }

  } catch (error) {
    console.error('Error checking HDFC config:', error);
  } finally {
    await pool.end();
  }
}

checkHDFCConfig();
