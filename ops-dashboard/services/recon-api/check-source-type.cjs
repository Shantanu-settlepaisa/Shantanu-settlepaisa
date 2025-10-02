const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433
});

async function checkSourceType() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        transaction_date,
        source_type,
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-02'
      GROUP BY transaction_date, source_type
      ORDER BY transaction_date, source_type
    `);
    
    console.log('Transactions on 2025-10-02 by source_type:');
    result.rows.forEach(row => {
      console.log(`  Date: ${row.transaction_date}, Source: ${row.source_type}, Count: ${row.count}`);
    });
    
    const sample = await client.query(`
      SELECT 
        transaction_id,
        source_type,
        source_name,
        transaction_date
      FROM sp_v2_transactions
      WHERE transaction_date = '2025-10-02'
      LIMIT 5
    `);
    
    console.log('\nSample transactions:');
    sample.rows.forEach(row => {
      console.log(`  ${row.transaction_id} | ${row.source_type} | ${row.source_name} | ${row.transaction_date}`);
    });
    
  } catch (error) {
    console.error('Error checking source type:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSourceType().catch(console.error);
