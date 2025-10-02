const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('[Migration] Running 007_settlement_tables_v1_logic.sql');
    
    const sql = fs.readFileSync('db/migrations/007_settlement_tables_v1_logic.sql', 'utf8');
    
    await client.query(sql);
    
    console.log('✅ [Migration] Settlement tables created successfully');
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'sp_v2_settlement%'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Created tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ [Migration] Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
