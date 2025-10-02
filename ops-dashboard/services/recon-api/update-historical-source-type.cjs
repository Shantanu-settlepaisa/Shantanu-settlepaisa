const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433
});

async function updateHistoricalData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const txnUpdate = await client.query(`
      UPDATE sp_v2_transactions 
      SET source_type = 'MANUAL_UPLOAD', 
          source_name = 'MANUAL_UPLOAD' 
      WHERE source_type = 'CONNECTOR'
    `);
    
    console.log(`Updated ${txnUpdate.rowCount} transactions from CONNECTOR to MANUAL`);
    
    const bankUpdate = await client.query(`
      UPDATE sp_v2_bank_statements 
      SET source_type = 'MANUAL_UPLOAD', 
          source_file = 'MANUAL_UPLOAD' 
      WHERE source_type IN ('SFTP_CONNECTOR', 'CONNECTOR')
    `);
    
    console.log(`Updated ${bankUpdate.rowCount} bank statements from CONNECTOR to MANUAL`);
    
    await client.query('COMMIT');
    
    const verify = await client.query(`
      SELECT 
        source_type,
        COUNT(*) as count
      FROM sp_v2_transactions
      GROUP BY source_type
    `);
    
    console.log('\nTransactions by source_type:');
    verify.rows.forEach(row => {
      console.log(`  ${row.source_type}: ${row.count}`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating historical data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateHistoricalData().catch(console.error);
