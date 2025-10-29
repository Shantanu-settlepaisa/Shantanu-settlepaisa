const { Pool } = require('pg');
require('dotenv').config({ path: './services/overview-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkHDFCBank() {
  try {
    console.log('Searching for HDFC BANK config...\n');

    const result = await pool.query(`
      SELECT
        bank_name,
        config_name,
        is_active,
        v1_column_mappings,
        source
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) LIKE '%HDFC%'
         OR UPPER(config_name) LIKE '%HDFC%'
      ORDER BY is_active DESC
    `);

    if (result.rows.length === 0) {
      console.log('❌ NO HDFC BANK config found!');
      console.log('\nListing ALL banks in the database:\n');

      const allBanks = await pool.query(`
        SELECT bank_name, config_name, is_active
        FROM sp_v2_bank_column_mappings
        ORDER BY bank_name
      `);

      allBanks.rows.forEach(row => {
        console.log(`  ${row.is_active ? '✅' : '❌'} ${row.bank_name} (config: ${row.config_name})`);
      });
    } else {
      console.log(`✅ Found ${result.rows.length} HDFC config(s):\n`);
      result.rows.forEach((row, idx) => {
        console.log(`Config ${idx + 1}:`);
        console.log(`  Bank Name: ${row.bank_name}`);
        console.log(`  Config Name: ${row.config_name}`);
        console.log(`  Active: ${row.is_active}`);
        console.log(`  Source: ${row.source}`);
        console.log(`  Mappings: ${JSON.stringify(row.v1_column_mappings, null, 2)}`);
        console.log('---\n');
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkHDFCBank();
