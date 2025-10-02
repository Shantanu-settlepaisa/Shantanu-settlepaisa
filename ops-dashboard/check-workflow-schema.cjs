const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkSchema() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_exception_workflow'
      ORDER BY ordinal_position
    `);
    
    console.log('sp_v2_exception_workflow columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema();
