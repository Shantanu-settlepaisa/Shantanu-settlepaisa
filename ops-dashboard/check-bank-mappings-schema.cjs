const { Pool } = require('pg');
require('dotenv').config({ path: './services/overview-api/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkBankMappingsTable() {
  try {
    // Check if table exists
    console.log('Checking sp_v2_bank_column_mappings table...\n');

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_bank_column_mappings'
      );
    `);

    console.log(`Table exists: ${tableCheck.rows[0].exists}\n`);

    if (tableCheck.rows[0].exists) {
      // Get all columns
      const columnsResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_bank_column_mappings'
        ORDER BY ordinal_position
      `);

      console.log('Table columns:');
      columnsResult.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });

      // Get sample data
      console.log('\nSample data:');
      const sampleData = await pool.query(`
        SELECT *
        FROM sp_v2_bank_column_mappings
        LIMIT 3
      `);

      console.log(`Found ${sampleData.rows.length} rows:\n`);
      sampleData.rows.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, JSON.stringify(row, null, 2));
      });
    } else {
      console.log('❌ Table sp_v2_bank_column_mappings does NOT exist!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBankMappingsTable();
