const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function discoverSchema() {
  const client = await pool.connect();

  try {
    // Get column names
    const schemaResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_items'
      ORDER BY ordinal_position
    `);

    console.log('📋 sp_v2_settlement_items Schema:');
    console.log('');
    schemaResult.rows.forEach((col) => {
      console.log('  -', col.column_name, '(' + col.data_type + ')');
    });

    console.log('');
    console.log('📊 Sample Data (1 row):');
    const sampleResult = await client.query(`
      SELECT * FROM sp_v2_settlement_items
      LIMIT 1
    `);

    if (sampleResult.rows.length > 0) {
      const sample = sampleResult.rows[0];
      Object.keys(sample).forEach((key) => {
        console.log('  ', key + ':', sample[key]);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

discoverSchema().catch(console.error);
