const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function compareSchemas() {
  try {
    console.log('📊 TABLE SCHEMA COMPARISON:\n');

    // PG transactions columns
    const pgCols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_transactions'
      ORDER BY ordinal_position
    `);

    // Bank statements columns
    const bankCols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_bank_statements'
      ORDER BY ordinal_position
    `);

    console.log('sp_v2_transactions columns:');
    pgCols.rows.forEach(row => console.log(`  - ${row.column_name}`));

    console.log('\nsp_v2_bank_statements columns:');
    bankCols.rows.forEach(row => console.log(`  - ${row.column_name}`));

    // Check which columns are missing
    const pgColNames = pgCols.rows.map(r => r.column_name);
    const bankColNames = bankCols.rows.map(r => r.column_name);

    console.log('\n❌ Columns in PG but NOT in Bank:');
    pgColNames.filter(col => !bankColNames.includes(col)).forEach(col => {
      console.log(`  - ${col}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

compareSchemas();
