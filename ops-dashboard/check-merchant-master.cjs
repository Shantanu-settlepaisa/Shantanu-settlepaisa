const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('\n1. Checking sp_v2_merchants_master table:');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sp_v2_merchants_master'
      ORDER BY ordinal_position
    `);
    
    if (columns.rows.length > 0) {
      console.log('   Columns:');
      columns.rows.forEach(r => console.log(`   - ${r.column_name}: ${r.data_type}`));
      
      console.log('\n2. Checking for MERCH001:');
      const data = await pool.query(`SELECT * FROM sp_v2_merchants_master LIMIT 5`);
      console.log(`   Total rows: ${data.rows.length}`);
      if (data.rows.length > 0) {
        console.log('   Sample data:', JSON.stringify(data.rows[0], null, 2));
      }
    } else {
      console.log('   Table does not exist');
    }
    
  } catch (error) {
    console.error('   Error:', error.message);
  } finally {
    await pool.end();
  }
})();
