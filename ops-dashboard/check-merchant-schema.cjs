const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'sp_v2_merchants'
    ORDER BY ordinal_position
  `);
  
  console.log('sp_v2_merchants columns:');
  result.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  
  await pool.end();
})();
