const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    database: 'settlepaisa_v2',
    user: 'postgres',
    password: 'settlepaisa123'
  });

  try {
    console.log('📋 Applying Migration 024: Settlement Automation & Triggers...\n');
    
    const migrationPath = '/Users/shantanusingh/ops-dashboard/db/migrations/024_add_verification_and_settlement_automation.sql';
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Executing migration SQL...');
    await pool.query(sql);
    
    console.log('\n✅ Migration 024 applied successfully!\n');
    
    // Verify trigger installation
    const trigger = await pool.query(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_transaction_status_change'
    `);
    console.log('✓ Trigger installed:', trigger.rows.length > 0 ? 'YES' : 'NO');
    
    // Check settlement_queue table
    const table = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'sp_v2_settlement_queue'
    `);
    console.log('✓ Settlement queue table:', table.rows.length > 0 ? 'EXISTS' : 'MISSING');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await pool.end();
  }
})();
